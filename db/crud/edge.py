"""Data-access functions for `edges`, shared by backend and etl (see
db/README.md for why this package exists). Routing-specific concerns
(RoutableEdge, list_for_routing) live in backend/app/services/routing.py
instead -- they're an input shape for the Dijkstra algorithm, not a
generic database operation, and etl never needs them."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from db.models.edge import Edge


def upsert(
    db: Session,
    *,
    source_id: int,
    target_id: int,
    mode: str,
    fare: float,
    time_min: float,
    reliability: int,
    direction: str = "one_way",
    source_data: str = "manual",
) -> Edge:
    """Merge a new field observation onto an existing edge (widen the fare
    range, running-average the time) or create one. Used by
    etl/field_data/load.py; same merge semantics as the original
    etl/field_data/."""
    existing = db.execute(
        select(Edge).where(Edge.source == source_id, Edge.target == target_id, Edge.mode == mode)
    ).scalars().first()

    if existing:
        n = existing.sample_count
        existing.fare_min = min(existing.fare_min, fare) if existing.fare_min is not None else fare
        existing.fare_max = max(existing.fare_max, fare) if existing.fare_max is not None else fare
        existing.avg_time_min = (float(existing.avg_time_min) * n + time_min) / (n + 1)
        existing.reliability = reliability
        existing.sample_count = n + 1
        existing.verified_at = func.now()
        db.flush()
        return existing

    edge = Edge(
        source=source_id, target=target_id, mode=mode,
        fare_min=fare, fare_max=fare, avg_time_min=time_min,
        reliability=reliability, direction=direction,
        sample_count=1, source_data=source_data, verified_at=func.now(),
    )
    db.add(edge)
    db.flush()
    return edge


def create_estimated(
    db: Session,
    *,
    source_id: int,
    target_id: int,
    mode: str,
    time_min: float,
    direction: str = "bidirectional",
) -> Edge:
    """A machine-generated connection created when 'leveling' a new stop
    into the network (backend/app/services/network.py) -- distance-derived,
    not field-verified. `fare_min/max` stay NULL (never invent a fare) and
    `source_data='estimated'` so routing/UI can flag it as unconfirmed
    until someone actually rides it and field data overwrites it via
    upsert() above."""
    edge = Edge(
        source=source_id, target=target_id, mode=mode,
        fare_min=None, fare_max=None, avg_time_min=time_min,
        reliability=None, direction=direction,
        sample_count=0, source_data="estimated",
    )
    db.add(edge)
    db.flush()
    return edge
