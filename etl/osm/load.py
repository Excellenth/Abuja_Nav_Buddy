"""
LOAD: upsert OSM transit points (from etl/osm/extract.py) into
the `destinations` cache -- the same table Nominatim lookups populate
(see db/crud/destination.py). This is deliberately a cache seed,
not a write into `nodes`: even a formally-tagged OSM bus stop isn't
routable infrastructure until a human ground-truths it (see
etl/osm/extract.py's module docstring).

`destinations` has no unique constraint on query_text (repeated free-text
lookups are expected to accumulate), so this dedupes explicitly against
an existing case-insensitive name match before inserting, rather than
relying on the DB to reject a duplicate.
"""

from sqlalchemy.orm import Session

from db import crud


def load_transit_points(db: Session, points: list[dict]) -> tuple[int, int]:
    """Returns (inserted, skipped_as_duplicate)."""
    inserted = 0
    skipped = 0
    for p in points:
        if crud.destination.lookup_cached(db, p["name"]) is not None:
            skipped += 1
            continue
        crud.destination.cache(
            db,
            query_text=p["name"],
            resolved_name=p["name"],
            lat=p["lat"],
            lng=p["lng"],
            resolved_via="osm_overpass",
        )
        inserted += 1
    return inserted, skipped
