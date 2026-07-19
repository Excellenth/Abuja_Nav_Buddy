from typing import Literal

from pydantic import BaseModel

TransportMode = Literal["okada", "keke_napep", "minibus", "shared_taxi"]
OptimizeFor = Literal["fastest", "cheapest", "fewest_transfers"]


class TripRequest(BaseModel):
    origin_text: str
    destination_text: str
    optimize_for: OptimizeFor = "fastest"
    avoid_modes: list[TransportMode] = []
    has_luggage: bool = False
    direct_only: bool = False


class AskRequest(BaseModel):
    question: str


class ChosenStopsRequest(BaseModel):
    """Body for POST /trip/from-nodes -- used once the commuter has picked
    a specific origin/destination stop from the nearest-stops picker
    (GET /nodes/nearby), so routing runs against a node id they explicitly
    confirmed rather than 'nearest by distance'."""

    origin_node_id: int
    destination_node_id: int
    optimize_for: OptimizeFor = "fastest"
    avoid_modes: list[TransportMode] = []
    has_luggage: bool = False
    direct_only: bool = False


class TripStep(BaseModel):
    type: Literal["walk", "ride"]
    mode: str | None = None
    from_name: str
    to_name: str
    # Landmark reference for both ends, always populated when set on the
    # node -- "Utako (opposite Zenith Bank)" rather than just "Utako".
    # Manual entry only (POST /nodes) -- see PROJECT_DECISIONS.md.
    from_landmark: str | None = None
    to_landmark: str | None = None
    # Real coordinates for both ends -- a ride step's are the graph nodes'
    # own coordinates; a walk step's "display_name" end is the raw
    # geocoded/GPS point (see app/services/geocode.py:resolve_endpoint),
    # its node end is the matched stop. Lets a client draw the actual path
    # instead of guessing a line between the two named points.
    from_lat: float | None = None
    from_lng: float | None = None
    to_lat: float | None = None
    to_lng: float | None = None
    distance_m: float | None = None
    fare_ngn: float | None = None
    time_min: float | None = None
    # True if this leg is a machine-generated connection (see
    # services/network.py:add_stop_and_connect) rather than a
    # field-verified observation -- its time/mode are a distance-based
    # estimate and may be wrong. A route can legitimately look "fastest"
    # purely because an estimated leg's guessed time undercuts a real,
    # field-measured one; the caller must be able to show that caveat.
    estimated: bool = False


class TripResponse(BaseModel):
    found: bool
    message: str | None = None
    steps: list[TripStep] = []
    total_fare_ngn: float | None = None
    total_time_min: float | None = None
    leg_count: int | None = None
    # True if any step in this trip is estimated rather than field-verified.
    includes_estimated_legs: bool = False
    parsed_intent: dict | None = None
