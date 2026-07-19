"""
'Leveling' a new stop into the network: given a name + coordinate for a
bus stop that isn't mapped yet (e.g. "Gwarinpa City Gate"), create its
node and connect it to the nearest existing stops with a distance-derived
estimated edge -- so it's routable immediately, without waiting for
someone to physically ride and log every leg first.

This does NOT invent a fare (fare_min/fare_max stay NULL) and every edge
it creates is tagged source_data='estimated' -- the routing engine and any
UI built on top of this must be able to tell "someone rode this and timed
it" (source_data in osm/manual/crowdsourced) apart from "the system
guessed this from geometry" (estimated). Field data collected later
(etl/field_data/) overwrites the estimate via crud.edge.upsert.
"""

from sqlalchemy.orm import Session

from db import crud
from db.models.edge import Edge
from db.models.node import Node

# Straight-line distance underestimates actual road distance (roads
# aren't straight lines). This is a rough, documented fudge factor, not a
# claim of precision -- see the module docstring on why these edges are
# tagged 'estimated'.
ROAD_INDIRECTION_FACTOR = 1.3

# (max_road_distance_m, mode, speed_m_per_min) -- first band the estimated
# road distance falls under wins. Speeds are rough Abuja informal-transit
# assumptions (mixed traffic, not free-flow), not measured -- replace with
# field-observed averages as they come in.
MODE_BANDS: list[tuple[float, str, float]] = [
    (500, "walk", 75),  # ~4.5 km/h
    (3_000, "keke_napep", 250),  # ~15 km/h
    (8_000, "shared_taxi", 420),  # ~25 km/h
    (float("inf"), "minibus", 330),  # ~20 km/h, longer legs
]


def estimate_connection(straight_line_m: float) -> tuple[str, float]:
    """Returns (mode, time_min) for a straight-line distance, via the
    road-indirection fudge factor and MODE_BANDS above. The last band caps
    at float("inf"), so this always returns from inside the loop."""
    road_distance_m = straight_line_m * ROAD_INDIRECTION_FACTOR
    for max_distance, mode, speed in MODE_BANDS:
        if road_distance_m <= max_distance:
            return mode, max(1.0, road_distance_m / speed)
    raise AssertionError("unreachable: MODE_BANDS must end with a float('inf') band")


def add_stop_and_connect(
    db: Session,
    *,
    name: str,
    node_type: str,
    lat: float,
    lng: float,
    notes: str | None,
    landmark_description: str | None,
    connect_to_nearest: int,
) -> tuple[Node, list[tuple[Node, Edge, str]]]:
    """Creates the node, connects it to the `connect_to_nearest` closest
    existing loading_point/transfer_point nodes, and returns
    (new_node, [(other_node, edge, mode), ...]). `landmark_description` is
    manual-entry only (e.g. 'opposite Zenith Bank') -- there's no longer an
    auto-fill source for it; an earlier version drew this from ingested
    Overture Maps places, which was removed (see PROJECT_DECISIONS.md)."""
    node = crud.node.create(
        db,
        name=name,
        node_type=node_type,
        lat=lat,
        lng=lng,
        notes=notes,
        landmark_description=landmark_description,
        source="manual",
    )

    if connect_to_nearest <= 0:
        return node, []

    nearby = crud.node.nearest_any(
        db, lat, lng,
        limit=connect_to_nearest,
        node_types=["loading_point", "transfer_point"],
        exclude_id=node.node_id,
    )

    created: list[tuple[Node, Edge, str]] = []
    for other, distance_m in nearby:
        mode, time_min = estimate_connection(distance_m)
        edge = crud.edge.create_estimated(
            db,
            source_id=node.node_id,
            target_id=other.node_id,
            mode=mode,
            time_min=round(time_min, 1),
            direction="bidirectional",
        )
        created.append((other, edge, mode))

    return node, created
