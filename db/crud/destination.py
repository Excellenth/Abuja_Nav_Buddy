"""Cache for geocoded free-text place lookups (see db/schema.sql)."""

from geoalchemy2 import Geometry
from geoalchemy2.functions import ST_X, ST_Y
from sqlalchemy import cast, func, select, update
from sqlalchemy.orm import Session

from db.models.destination import Destination


def lookup_cached(db: Session, text: str) -> tuple[str, float, float] | None:
    """Returns (resolved_name, lat, lng), or None on a cache miss.
    Extracts lat/lng in SQL (ST_Y/ST_X) rather than round-tripping a
    Geography value back through Python. ST_Y/ST_X only accept `geometry`,
    not `geography` -- the ::geometry cast is required, not decorative."""
    geom = cast(Destination.geom, Geometry)
    stmt = (
        select(Destination.destination_id, Destination.resolved_name, ST_Y(geom), ST_X(geom))
        .where(func.lower(Destination.query_text) == text.lower())
        .order_by(Destination.last_used_at.desc())
        .limit(1)
    )
    row = db.execute(stmt).first()
    if row is None:
        return None
    destination_id, resolved_name, lat, lng = row
    db.execute(update(Destination).where(Destination.destination_id == destination_id).values(last_used_at=func.now()))
    db.flush()
    return resolved_name, float(lat), float(lng)


def cache(db: Session, *, query_text: str, resolved_name: str, lat: float, lng: float, resolved_via: str) -> Destination:
    dest = Destination(
        query_text=query_text,
        resolved_name=resolved_name,
        geom=func.ST_MakePoint(lng, lat),
        resolved_via=resolved_via,
    )
    db.add(dest)
    db.flush()
    return dest
