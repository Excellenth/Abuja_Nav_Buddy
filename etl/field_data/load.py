"""
LOAD: upsert field-survey rows (from etl/field_data/extract.py) into the
routable graph (`nodes` + `edges`).

Safe to re-run as more samples come in on the same legs -- matching nodes
(by GPS proximity) and edges (by source/target/mode) are MERGED, not
duplicated: the fare range widens to cover everything observed, and
avg_time_min becomes a running average across all samples (see
`sample_count` on the edges table, and db/crud/edge.py:upsert).

Node matching is by GPS proximity only (within NODE_MATCH_RADIUS_METERS).
At single-corridor scale (dozens of nodes) that's enough, and false merges
are easy to spot by eye and fix with a manual UPDATE -- don't build fuzzy
name-matching for a graph this small.
"""

from sqlalchemy.orm import Session

from db import crud

NODE_MATCH_RADIUS_METERS = 75


def _find_or_create_node(db: Session, name: str, lat: float, lng: float, node_type: str) -> int:
    existing = crud.node.find_within_radius(db, lat, lng, NODE_MATCH_RADIUS_METERS)
    if existing:
        if existing.name != name:
            # record the name variant so commuters searching either name resolve to this node
            crud.node.add_alias(db, existing, name)
        return existing.node_id

    node = crud.node.create(db, name=name, node_type=node_type, lat=lat, lng=lng, source="manual", verified=True)
    return node.node_id


def load_rows(db: Session, rows: list[dict]) -> list[str]:
    """Returns a log line per row processed, for the CLI to print."""
    log: list[str] = []
    for row in rows:
        from_id = _find_or_create_node(
            db, row["from_name"], float(row["from_lat"]), float(row["from_lng"]), row["from_type"]
        )
        to_id = _find_or_create_node(
            db, row["to_name"], float(row["to_lat"]), float(row["to_lng"]), row["to_type"]
        )
        # avg_time_min is board-to-arrival time -- wait time before the
        # vehicle leaves is part of what a commuter actually experiences,
        # and has to be counted so a direct ride and a "ride + transfer"
        # alternative are compared on the same footing.
        total_time_min = float(row["wait_time_min"]) + float(row["travel_time_min"])
        edge = crud.edge.upsert(
            db,
            source_id=from_id,
            target_id=to_id,
            mode=row["mode"],
            fare=float(row["fare_ngn"]),
            time_min=total_time_min,
            reliability=int(row["reliability_1to5"]),
            direction=row.get("direction", "one_way"),
            source_data="manual",
        )
        log.append(
            f"{row['from_name']} -> {row['to_name']} ({row['mode']}): "
            f"edge {edge.edge_id}, fare ₦{edge.fare_min:.0f}-₦{edge.fare_max:.0f}, "
            f"avg {float(edge.avg_time_min):.1f} min, n={edge.sample_count}"
        )
    return log
