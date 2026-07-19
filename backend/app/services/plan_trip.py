"""
The glue layer: turns (origin_text, destination_text, preferences) into a
full step-by-step TripResponse, by combining:
  - services/geocode.py  -- resolve free text -> nearest routable node(s)
  - services/routing.py  -- Dijkstra over the real graph with pluggable cost functions
Every step is landmark-annotated (from_landmark/to_landmark) so the
description always carries a venue reference, not just a bare stop name --
see app/services/ai.py:refine_description for where that gets turned into
prose.
"""

from geoalchemy2 import Geometry
from geoalchemy2.functions import ST_X, ST_Y
from sqlalchemy import cast, select
from sqlalchemy.orm import Session

from db import crud
from db.models.node import Node
from app.schemas.trip import TripResponse, TripStep
from app.services import geocode, routing


def _landmark_map(db: Session, names: set[str]) -> dict[str, str | None]:
    if not names:
        return {}
    rows = db.execute(select(Node.name, Node.landmark_description).where(Node.name.in_(names)))
    return {name: landmark for name, landmark in rows}


def _coords_map(db: Session, names: set[str]) -> dict[str, tuple[float, float]]:
    """Node name -> (lat, lng), for annotating TripStep endpoints with real
    coordinates a client can draw. ST_Y/ST_X only accept `geometry`, not
    `geography` -- the ::geometry cast is required, not decorative."""
    if not names:
        return {}
    geom = cast(Node.geom, Geometry)
    rows = db.execute(select(Node.name, ST_Y(geom), ST_X(geom)).where(Node.name.in_(names)))
    return {name: (float(lat), float(lng)) for name, lat, lng in rows}


def _total_fare(path) -> float | None:
    """Sum of fares across the path, or None if any non-walk leg's fare is
    unknown (RoutableEdge.fare == 0.0 with a non-'walk' mode -- see
    routing.py:list_for_routing, where a NULL fare_min in the DB becomes
    0.0). Walking is legitimately free; an untimed keke/taxi/bus leg is
    not -- silently summing it as ₦0 would misreport an estimated,
    unverified connection (see services/network.py) as a known free ride."""
    total = 0.0
    for edge in path:
        if edge.fare <= 0 and edge.mode != "walk":
            return None
        total += edge.fare
    return total


def plan_trip(
    db: Session,
    origin_text: str,
    destination_text: str,
    optimize_for: str = "fastest",
    avoid_modes: list[str] | None = None,
    has_luggage: bool = False,
    direct_only: bool = False,
) -> TripResponse:
    origin = geocode.resolve_endpoint(db, origin_text)
    destination = geocode.resolve_endpoint(db, destination_text)

    edges = routing.list_for_routing(db)
    result = routing.route(
        edges,
        origin["node_name"],
        destination["node_name"],
        optimize_for=optimize_for,
        avoid_modes=avoid_modes,
        has_luggage=has_luggage,
        direct_only=direct_only,
    )

    if result is None:
        message = (
            "No direct route exists between these two points."
            if direct_only
            else "No route found matching these preferences -- either no such "
            "connection exists yet, or every option was excluded by the filters."
        )
        return TripResponse(found=False, message=message)

    names = {origin["node_name"], destination["node_name"]}
    for edge in result.path:
        names.add(edge.source)
        names.add(edge.target)
    landmarks = _landmark_map(db, names)
    coords = _coords_map(db, names)

    steps: list[TripStep] = []
    if origin["walk_distance_m"] > 0:
        node_lat, node_lng = coords.get(origin["node_name"], (None, None))
        steps.append(TripStep(
            type="walk",
            from_name=origin["display_name"],
            to_name=origin["node_name"],
            to_landmark=landmarks.get(origin["node_name"]),
            distance_m=round(origin["walk_distance_m"]),
            from_lat=origin["lat"], from_lng=origin["lng"],
            to_lat=node_lat, to_lng=node_lng,
        ))
    for edge in result.path:
        s_lat, s_lng = coords.get(edge.source, (None, None))
        t_lat, t_lng = coords.get(edge.target, (None, None))
        steps.append(TripStep(
            type="ride",
            mode=edge.mode,
            from_name=edge.source,
            to_name=edge.target,
            from_landmark=landmarks.get(edge.source),
            to_landmark=landmarks.get(edge.target),
            fare_ngn=edge.fare or None,
            time_min=edge.time_min,
            estimated=edge.estimated,
            from_lat=s_lat, from_lng=s_lng, to_lat=t_lat, to_lng=t_lng,
        ))
    if destination["walk_distance_m"] > 0:
        node_lat, node_lng = coords.get(destination["node_name"], (None, None))
        steps.append(TripStep(
            type="walk",
            from_name=destination["node_name"],
            from_landmark=landmarks.get(destination["node_name"]),
            to_name=destination["display_name"],
            distance_m=round(destination["walk_distance_m"]),
            from_lat=node_lat, from_lng=node_lng,
            to_lat=destination["lat"], to_lng=destination["lng"],
        ))

    return TripResponse(
        found=True,
        steps=steps,
        total_fare_ngn=_total_fare(result.path),
        total_time_min=sum(e.time_min for e in result.path),
        leg_count=len(result.path),
        includes_estimated_legs=any(e.estimated for e in result.path),
    )


def plan_trip_from_nodes(
    db: Session,
    origin_node_id: int,
    destination_node_id: int,
    optimize_for: str = "fastest",
    avoid_modes: list[str] | None = None,
    has_luggage: bool = False,
    direct_only: bool = False,
) -> TripResponse:
    """Same as plan_trip(), but the endpoints are already-confirmed node
    ids (e.g. a commuter picked one of the two nearest-stop candidates
    from GET /nodes/nearby) instead of free text -- skips geocoding
    entirely, walk_distance is always 0 since there's no 'true
    destination' point beyond the node itself."""
    origin_node = db.get(Node, origin_node_id)
    destination_node = db.get(Node, destination_node_id)
    if origin_node is None or destination_node is None:
        return TripResponse(found=False, message="Unknown node id -- has the network changed since you fetched candidates?")

    edges = routing.list_for_routing(db)
    result = routing.route(
        edges, origin_node.name, destination_node.name,
        optimize_for=optimize_for, avoid_modes=avoid_modes,
        has_luggage=has_luggage, direct_only=direct_only,
    )
    if result is None:
        message = (
            "No direct route exists between these two points."
            if direct_only
            else "No route found matching these preferences."
        )
        return TripResponse(found=False, message=message)

    names = {origin_node.name, destination_node.name, *(e.source for e in result.path), *(e.target for e in result.path)}
    landmarks = _landmark_map(db, names)
    coords = _coords_map(db, names)
    steps = [
        TripStep(
            type="ride", mode=edge.mode, from_name=edge.source, to_name=edge.target,
            from_landmark=landmarks.get(edge.source), to_landmark=landmarks.get(edge.target),
            fare_ngn=edge.fare or None, time_min=edge.time_min, estimated=edge.estimated,
            from_lat=coords.get(edge.source, (None, None))[0], from_lng=coords.get(edge.source, (None, None))[1],
            to_lat=coords.get(edge.target, (None, None))[0], to_lng=coords.get(edge.target, (None, None))[1],
        )
        for edge in result.path
    ]
    return TripResponse(
        found=True, steps=steps,
        total_fare_ngn=_total_fare(result.path),
        total_time_min=sum(e.time_min for e in result.path),
        leg_count=len(result.path),
        includes_estimated_legs=any(e.estimated for e in result.path),
    )
