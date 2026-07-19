"""
Resolves free-text place names to routable graph nodes. Ported from the
original scripts/geocode.py, restructured onto the crud layer, with one
behavioral addition: resolution now surfaces the top-K nearest routable
candidates (not just the single nearest) so the caller can let a commuter
pick the stop they actually recognize -- see app/routes/nodes.py's
GET /nodes/nearby and POST /resolve.

Flow per free-text endpoint (origin or destination):
  1. Exact match against an existing node name/alias? Use it directly --
     no geocoding, no walk needed.
  2. Otherwise check the `destinations` cache table for a prior lookup
     (includes OSM/Overpass-sourced transit points -- see etl/osm/).
  3. On a cache miss, geocode via Nominatim (free, no API key), biased to
     the FCT bbox, and cache the result.
  4. Return the top-K nearest *routable* nodes to that point, each with
     its walking distance -- the actual boarding choice is left to the
     caller (auto-pick nearest, or ask the commuter).
"""

import logging
import time

import requests
from sqlalchemy.orm import Session

from db import crud
from app.config import settings
from db.models.node import Node

logger = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_USER_AGENT = "abuja-transit-mvp/0.2 (local dev prototype)"
# Beyond this, "nearest node" is technically true but practically useless --
# better to say the area isn't mapped yet than hand back a multi-km walk.
MAX_REASONABLE_WALK_METERS = 1000


class ResolutionError(Exception):
    """Raised when a place can't be resolved at all -- the 'safe failure'
    case: better to say 'I don't know this place' than guess."""


def _geocode_via_nominatim(text: str) -> tuple[str, float, float]:
    viewbox = f"{settings.bbox_west},{settings.bbox_north},{settings.bbox_east},{settings.bbox_south}"
    resp = requests.get(
        NOMINATIM_URL,
        params={
            "q": text if "nigeria" in text.lower() else f"{text}, Nigeria",
            "format": "json",
            "limit": 1,
            "viewbox": viewbox,
            "bounded": 0,  # bias toward the box, don't hard-exclude outside it
        },
        headers={"User-Agent": NOMINATIM_USER_AGENT},  # required by Nominatim's usage policy
        timeout=10,
    )
    resp.raise_for_status()
    results = resp.json()
    if not results:
        raise ResolutionError(f"Could not find a location matching '{text}'")
    best = results[0]
    return best["display_name"], float(best["lat"]), float(best["lon"])


def geocode_text(db: Session, text: str) -> tuple[str, float, float]:
    """Resolve free text to (resolved_name, lat, lng): the `destinations`
    cache first, then live Nominatim as the fallback."""
    cached = crud.destination.lookup_cached(db, text)
    if cached:
        logger.info("geocode cache hit: %r", text)
        return cached

    logger.info("geocode falling back to live Nominatim call: %r", text)
    resolved_name, lat, lng = _geocode_via_nominatim(text)
    crud.destination.cache(db, query_text=text, resolved_name=resolved_name, lat=lat, lng=lng, resolved_via="osm_nominatim")
    time.sleep(1)  # Nominatim's usage policy caps public requests at ~1/sec
    return resolved_name, lat, lng


def candidates_for_point(db: Session, lat: float, lng: float, limit: int = 2) -> list[tuple[Node, float, float, float]]:
    """Top-`limit` nearest routable nodes to a raw coordinate, each as
    (node, distance_m, node_lat, node_lng)."""
    return crud.node.nearest_routable(db, lat, lng, limit=limit)


def resolve_candidates(db: Session, text: str, limit: int = 2) -> dict:
    """Full resolution for one free-text endpoint. Returns:
      {display_name, candidates: [(node, distance_m, node_lat, node_lng), ...], lat, lng}
    `lat`/`lng` is the raw resolved point for `text` itself (the node's own
    coordinates on an exact match, otherwise the geocoded point) -- kept
    alongside the candidates so a caller can draw the actual walk distance
    on a map rather than just knowing its length. `candidates` has exactly
    one entry (distance 0) when `text` is an exact node name/alias match --
    no picker needed in that case.
    """
    exact = crud.node.get_by_exact_name_or_alias(db, text)
    if exact:
        found = crud.node.get_coords(db, exact.node_id)
        assert found is not None  # exact came from a live query moments ago
        _, lat, lng = found
        return {"display_name": exact.name, "candidates": [(exact, 0.0, lat, lng)], "lat": lat, "lng": lng}

    resolved_name, lat, lng = geocode_text(db, text)
    candidates = candidates_for_point(db, lat, lng, limit=limit)
    if not candidates:
        raise ResolutionError("No routable node exists anywhere near this location yet")
    if candidates[0][1] > MAX_REASONABLE_WALK_METERS:
        raise ResolutionError(
            f"Nearest mapped stop ('{candidates[0][0].name}') is {candidates[0][1]:.0f}m away -- "
            f"no field-verified stop near this location yet"
        )
    return {"display_name": resolved_name, "candidates": candidates, "lat": lat, "lng": lng}


def resolve_endpoint(db: Session, text: str) -> dict:
    """Backward-compatible single-best-match resolution, used by /trip and
    /ask. Returns {node_name, walk_distance_m, display_name, lat, lng}."""
    result = resolve_candidates(db, text, limit=1)
    node, distance_m, _, _ = result["candidates"][0]
    return {
        "node_name": node.name, "walk_distance_m": distance_m,
        "display_name": result["display_name"], "lat": result["lat"], "lng": result["lng"],
    }
