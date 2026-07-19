from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db import crud
from app.database import get_db
from app.schemas.node import ConnectResult, EdgeOut, NodeCandidate, NodeCreate, NodeOut, NodeSearchResult
from app.services.network import add_stop_and_connect

router = APIRouter(prefix="/nodes", tags=["nodes"])


@router.get("/search", response_model=list[NodeSearchResult])
def search_stops(
    q: str = Query(..., min_length=1),
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    """Typeahead search over known, already-mapped stops by name/alias
    substring -- e.g. 'galadi' surfaces 'Galadimawa Bridge' even though
    it's an informal name no external geocoder has ever heard of. A
    client should merge this with a live geocoder's results, known stops
    first."""
    results = crud.node.search_by_name(db, q, limit=limit)
    return [
        NodeSearchResult(
            node_id=node.node_id, name=node.name, node_type=node.node_type,
            landmark_description=node.landmark_description, lat=lat, lng=lng,
        )
        for node, lat, lng in results
    ]


@router.get("/nearby", response_model=list[NodeCandidate])
def nearby_stops(
    lat: float = Query(...),
    lng: float = Query(...),
    limit: int = Query(2, ge=1, le=10),
    db: Session = Depends(get_db),
):
    """Nearest routable stops to a raw coordinate (e.g. the user's GPS
    position, or a map tap) -- the picker: 'closest mapped stop is X, but Y
    is also nearby, which do you know?'."""
    candidates = crud.node.nearest_routable(db, lat, lng, limit=limit)
    return [
        NodeCandidate(
            node_id=node.node_id, name=node.name, node_type=node.node_type,
            landmark_description=node.landmark_description, distance_m=round(distance_m),
            lat=node_lat, lng=node_lng,
        )
        for node, distance_m, node_lat, node_lng in candidates
    ]


@router.post("", response_model=ConnectResult)
def create_stop(req: NodeCreate, db: Session = Depends(get_db)):
    """Add a new bus stop (e.g. 'Gwarinpa City Gate') and 'level' it into
    the network: auto-connects it to the nearest existing stops with a
    distance-estimated edge. `landmark_description` is manual-entry only
    (no auto-fill source). See app/services/network.py for exactly how the
    estimate is derived -- every edge created here is tagged
    source_data='estimated' until field data (etl/field_data/) confirms it."""
    node, connections = add_stop_and_connect(
        db,
        name=req.name, node_type=req.node_type, lat=req.lat, lng=req.lng,
        notes=req.notes, landmark_description=req.landmark_description,
        connect_to_nearest=req.connect_to_nearest,
    )
    return ConnectResult(
        node=NodeOut(
            node_id=node.node_id, name=node.name, node_type=node.node_type,
            lat=req.lat, lng=req.lng, landmark_description=node.landmark_description,
        ),
        edges_created=[
            EdgeOut(
                edge_id=edge.edge_id, source_name=node.name, target_name=other.name,
                mode=mode, fare_min=None, fare_max=None, avg_time_min=float(edge.avg_time_min),
                source_data=edge.source_data, estimated=True,
            )
            for other, edge, mode in connections
        ],
    )
