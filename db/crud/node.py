"""
Data-access functions for `nodes`, shared by backend and etl (see
db/README.md). No HTTP concerns here (that's backend/app/routes/), no
routing algorithm (that's backend/app/services/routing.py) -- just
PostGIS-backed reads/writes via SQLAlchemy + GeoAlchemy2.
"""

from geoalchemy2 import Geography, Geometry
from geoalchemy2.functions import ST_Distance, ST_DWithin, ST_MakePoint, ST_X, ST_Y
from sqlalchemy import cast, exists, func, or_, select
from sqlalchemy.orm import Session

from db.models.edge import Edge
from db.models.node import Node


def _point(lat: float, lng: float):
    return cast(ST_MakePoint(lng, lat), Geography("POINT", srid=4326))


def get_coords(db: Session, node_id: int) -> tuple[Node, float, float] | None:
    """Returns (node, lat, lng), or None if node_id doesn't exist. ST_Y/ST_X
    only accept `geometry`, not `geography` -- the ::geometry cast is
    required, not decorative."""
    geom = cast(Node.geom, Geometry)
    stmt = select(Node, ST_Y(geom), ST_X(geom)).where(Node.node_id == node_id)
    row = db.execute(stmt).first()
    return (row[0], float(row[1]), float(row[2])) if row else None


def get_by_exact_name_or_alias(db: Session, text: str) -> Node | None:
    """Fast path: skip geocoding entirely if the text matches a node name
    or alias exactly (case-insensitive)."""
    by_name = db.execute(
        select(Node).where(func.lower(Node.name) == text.lower())
    ).scalars().first()
    if by_name:
        return by_name

    # Alias match: filtered in Python over the (small, pilot-scale) node
    # set rather than a fragile SQL unnest-and-lower expression -- see
    # db/schema.sql's note that this graph is dozens, not millions, of rows.
    for node in db.execute(select(Node)).scalars().all():
        if any(a.lower() == text.lower() for a in (node.aliases or [])):
            return node
    return None


def search_by_name(db: Session, query: str, limit: int = 5) -> list[tuple[Node, float, float]]:
    """Substring match against node names/aliases (case-insensitive), for a
    typeahead search box -- e.g. typing 'galadi' should surface 'Galadimawa
    Bridge' even though it's an informal name Nominatim has never heard of.
    Returns [(node, lat, lng), ...]. Filtered in Python over the full node
    set, same reasoning as get_by_exact_name_or_alias -- this graph is
    dozens, not millions, of rows."""
    q = query.lower().strip()
    if not q:
        return []
    geom = cast(Node.geom, Geometry)
    rows = db.execute(select(Node, ST_Y(geom), ST_X(geom))).all()
    matches = [
        (node, lat, lng)
        for node, lat, lng in rows
        if q in node.name.lower() or any(q in a.lower() for a in (node.aliases or []))
    ]
    return [(node, float(lat), float(lng)) for node, lat, lng in matches[:limit]]


def nearest_routable(db: Session, lat: float, lng: float, limit: int = 2) -> list[tuple[Node, float, float, float]]:
    """Top-`limit` nearest nodes that are actually part of the routable
    graph (a loading_point/transfer_point with at least one edge) --
    returns [(node, distance_m, node_lat, node_lng), ...] ordered
    nearest-first. Coordinates are included so a picker UI can place/use
    the candidate without a second lookup.

    `limit=2` by default so the caller can present a picker ("closest
    mapped stop is X, but Y is also nearby -- which do you know?") instead
    of silently trusting the single nearest match.
    """
    point = _point(lat, lng)
    geom = cast(Node.geom, Geometry)
    has_edge = exists().where(or_(Edge.source == Node.node_id, Edge.target == Node.node_id))
    stmt = (
        select(Node, ST_Distance(Node.geom, point).label("distance_m"), ST_Y(geom), ST_X(geom))
        .where(Node.node_type.in_(["loading_point", "transfer_point"]))
        .where(has_edge)
        .order_by(Node.geom.op("<->")(point))
        .limit(limit)
    )
    return [(row.Node, float(row.distance_m), float(row[2]), float(row[3])) for row in db.execute(stmt)]


def nearest_any(
    db: Session,
    lat: float,
    lng: float,
    limit: int = 5,
    node_types: list[str] | None = None,
    exclude_id: int | None = None,
) -> list[tuple[Node, float]]:
    """Like nearest_routable, but not restricted to nodes that already have
    an edge -- used when 'leveling' a brand-new stop into the network,
    where a freshly-created node (or the very first node in an empty
    network) legitimately has zero edges yet."""
    point = _point(lat, lng)
    stmt = select(Node, ST_Distance(Node.geom, point).label("distance_m"))
    if node_types:
        stmt = stmt.where(Node.node_type.in_(node_types))
    if exclude_id is not None:
        stmt = stmt.where(Node.node_id != exclude_id)
    stmt = stmt.order_by(Node.geom.op("<->")(point)).limit(limit)
    return [(row.Node, float(row.distance_m)) for row in db.execute(stmt)]


def find_within_radius(db: Session, lat: float, lng: float, radius_m: float) -> Node | None:
    """GPS-proximity node matching for field-data import (see
    etl/field_data/load.py) -- merges samples onto the same node instead
    of creating near-duplicates."""
    point = _point(lat, lng)
    stmt = (
        select(Node)
        .where(ST_DWithin(Node.geom, point, radius_m))
        .order_by(Node.geom.op("<->")(point))
        .limit(1)
    )
    return db.execute(stmt).scalars().first()


def create(
    db: Session,
    *,
    name: str,
    node_type: str,
    lat: float,
    lng: float,
    notes: str | None = None,
    landmark_description: str | None = None,
    source: str = "manual",
    verified: bool = False,
) -> Node:
    node = Node(
        name=name,
        node_type=node_type,
        geom=func.ST_MakePoint(lng, lat),
        notes=notes,
        landmark_description=landmark_description,
        source=source,
        verified_at=func.now() if verified else None,
    )
    db.add(node)
    db.flush()  # populate node.node_id without committing
    return node


def add_alias(db: Session, node: Node, alias: str) -> None:
    if alias not in (node.aliases or []):
        node.aliases = [*(node.aliases or []), alias]
