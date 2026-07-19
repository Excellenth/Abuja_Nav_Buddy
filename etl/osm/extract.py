"""
EXTRACT: query OpenStreetMap directly via the Overpass API for
transit-tagged points in the FCT bbox -- bus stops, taxi ranks, and
anything else OSM tags as public-transport infrastructure.

Scoped to ONLY these tags on purpose: `highway=bus_stop`, `public_transport=*`,
`amenity=taxi`. OSM/Overpass is this project's only external map data source
(an earlier Overture Maps ingestion pipeline was tried and removed -- see
PROJECT_DECISIONS.md), so this stays narrowly scoped to transit
infrastructure rather than pulling every named place in the bbox.

Two important things this does NOT do, on purpose (see db/schema.sql):
  - It does not write to the `nodes` table directly. A tagged bus stop is
    a candidate `destinations` cache entry (see load.py), the same role
    Nominatim results play -- only ground-truthed loading points/transfer
    points a human has actually verified belong in `nodes`.
  - It will mostly come back EMPTY for Abuja's informal transit. Okada
    stages, keke stands, and informal transfer junctions mostly aren't
    mapped in OSM here -- that data has to come from field surveys (see
    etl/field_data/). This pipeline is a cheap, worth-running check, not
    a primary data source.

Overpass's public instance is a shared, free, rate-limited resource --
requests need a real User-Agent (its own usage policy) and can fail with
a transient "server too busy" error under load, so this retries with
backoff rather than treating one failure as fatal.
"""

import logging
import time

import requests

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "abuja-transit-etl/0.3 (local dev pipeline; contact via GitHub repo)"

QUERY_TEMPLATE = """
[out:json][timeout:60];
(
  node["highway"="bus_stop"]({bbox});
  node["public_transport"]({bbox});
  node["amenity"="taxi"]({bbox});
);
out center tags;
"""


def fetch_transit_points(bbox: tuple[float, float, float, float], retries: int = 3) -> list[dict]:
    """bbox = (west, south, east, north) -- same convention as the rest of
    this codebase (settings.bbox_*). Overpass QL itself wants
    south,west,north,east, so the conversion happens here, once.
    Returns [{name, lat, lng, category, osm_type, osm_id}, ...]. `name`
    may be a synthesized fallback (see below) since most of these points
    aren't named in OSM."""
    west, south, east, north = bbox
    query = QUERY_TEMPLATE.format(bbox=f"{south},{west},{north},{east}")

    last_error: Exception | None = None
    payload = None
    for attempt in range(1, retries + 1):
        try:
            resp = requests.post(
                OVERPASS_URL,
                data={"data": query},
                headers={"User-Agent": USER_AGENT},
                timeout=90,
            )
            resp.raise_for_status()
            payload = resp.json()
            break
        except Exception as e:  # network error, timeout, or a busy-server response
            last_error = e
            if attempt < retries:
                logger.warning("Overpass request failed (attempt %d/%d): %s -- retrying", attempt, retries, e)
                time.sleep(3 * attempt)
    if payload is None:
        raise RuntimeError(f"Overpass API request failed after {retries} attempts: {last_error}")

    points: list[dict] = []
    for el in payload.get("elements", []):
        tags = el.get("tags", {})
        if el["type"] == "node":
            lat, lng = el["lat"], el["lon"]
        else:  # way/relation: Overpass's "out center" gives a computed centroid
            center = el.get("center")
            if not center:
                continue
            lat, lng = center["lat"], center["lon"]

        category = tags.get("public_transport") or ("bus_stop" if tags.get("highway") == "bus_stop" else "taxi")
        # Most of these points have no `name` tag in OSM -- fall back to a
        # descriptive placeholder rather than dropping the point entirely,
        # since "there's an unnamed bus stop here" is still useful signal.
        name = tags.get("name") or f"Unnamed {category.replace('_', ' ')} ({el['type']}/{el['id']})"
        points.append({
            "name": name, "lat": lat, "lng": lng, "category": category,
            "osm_type": el["type"], "osm_id": el["id"],
        })
    return points
