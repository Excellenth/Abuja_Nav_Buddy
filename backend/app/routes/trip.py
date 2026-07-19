from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import crud
from app.database import get_db
from app.schemas.node import NodeCandidate, ResolveRequest, ResolveResponse
from app.schemas.trip import AskRequest, ChosenStopsRequest, TripRequest, TripResponse
from app.services import ai, geocode
from app.services.plan_trip import plan_trip, plan_trip_from_nodes

router = APIRouter(tags=["trip"])


@router.post("/resolve", response_model=ResolveResponse)
def resolve_endpoint(req: ResolveRequest, db: Session = Depends(get_db)):
    """Free text -> the nearest stop candidates (default 2), for a picker
    UI: 'closest mapped stop is X, but Y is also nearby -- which do you
    know?' Confirm one, then call POST /trip/from-nodes with its id."""
    try:
        result = geocode.resolve_candidates(db, req.text, limit=2)
    except geocode.ResolutionError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return ResolveResponse(
        display_name=result["display_name"],
        candidates=[
            NodeCandidate(
                node_id=node.node_id, name=node.name, node_type=node.node_type,
                landmark_description=node.landmark_description, distance_m=round(distance_m),
                lat=node_lat, lng=node_lng,
            )
            for node, distance_m, node_lat, node_lng in result["candidates"]
        ],
    )


@router.post("/trip", response_model=TripResponse)
def plan_trip_endpoint(req: TripRequest, db: Session = Depends(get_db)):
    try:
        return plan_trip(
            db, req.origin_text, req.destination_text,
            optimize_for=req.optimize_for, avoid_modes=req.avoid_modes,
            has_luggage=req.has_luggage, direct_only=req.direct_only,
        )
    except geocode.ResolutionError as e:
        # Safe failure, not a 500 -- "we don't know this place yet" is an
        # expected outcome, not a server error.
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/trip/from-nodes", response_model=TripResponse)
def plan_trip_from_nodes_endpoint(req: ChosenStopsRequest, db: Session = Depends(get_db)):
    """Route between two stops the commuter already confirmed via
    POST /resolve's candidate picker -- no geocoding involved."""
    return plan_trip_from_nodes(
        db, req.origin_node_id, req.destination_node_id,
        optimize_for=req.optimize_for, avoid_modes=req.avoid_modes,
        has_luggage=req.has_luggage, direct_only=req.direct_only,
    )


@router.post("/ask", response_model=TripResponse)
def ask_endpoint(req: AskRequest, db: Session = Depends(get_db)):
    try:
        parsed = ai.parse_trip_query(req.question)
    except Exception as e:
        # The LLM failed to produce a valid structured query -- safe
        # failure again, not a crash. Ask the user to rephrase rather than
        # guessing at intent.
        raise HTTPException(status_code=422, detail=f"Couldn't understand that question: {e}")

    try:
        result = plan_trip(
            db, parsed.origin_text, parsed.destination_text,
            optimize_for=parsed.optimize_for, avoid_modes=parsed.avoid_modes,
            has_luggage=parsed.has_luggage, direct_only=parsed.direct_only,
        )
    except geocode.ResolutionError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result.parsed_intent = parsed.model_dump()
    return result
