from typing import Literal

from pydantic import BaseModel, Field

NodeType = Literal["loading_point", "junction", "transfer_point", "bridge"]


class NodeCreate(BaseModel):
    """Body for POST /nodes -- add a new bus stop and 'level' it into the
    existing network (see app/services/network.py:add_stop_and_connect)."""

    name: str = Field(description="e.g. 'Gwarinpa City Gate'")
    node_type: NodeType = "loading_point"
    lat: float
    lng: float
    notes: str | None = None
    landmark_description: str | None = Field(
        default=None,
        description="e.g. 'opposite Zenith Bank, by the Gwarinpa Estate gate'. Manual entry only.",
    )
    connect_to_nearest: int = Field(
        default=3, ge=0, le=10,
        description="How many of the nearest existing routable nodes to auto-connect with an estimated edge.",
    )


class NodeCandidate(BaseModel):
    """One entry in the nearest-stops picker (GET /nodes/nearby) -- lets a
    commuter confirm which mapped stop they actually recognize, rather than
    silently trusting 'nearest by straight-line distance'. Carries lat/lng
    so a client can place it on a map or treat it as the confirmed stop's
    coordinates without a second lookup."""

    node_id: int
    name: str
    node_type: NodeType
    landmark_description: str | None
    distance_m: float
    lat: float
    lng: float


class EdgeOut(BaseModel):
    edge_id: int
    source_name: str
    target_name: str
    mode: str
    fare_min: float | None
    fare_max: float | None
    avg_time_min: float
    source_data: str
    estimated: bool


class NodeOut(BaseModel):
    node_id: int
    name: str
    node_type: NodeType
    lat: float
    lng: float
    landmark_description: str | None


class ConnectResult(BaseModel):
    node: NodeOut
    edges_created: list[EdgeOut]


class NodeSearchResult(BaseModel):
    """One entry in GET /nodes/search -- a known, already-mapped stop whose
    name/alias matched the query, for a typeahead search box. Unlike
    NodeCandidate there's no reference point, so no distance_m."""

    node_id: int
    name: str
    node_type: NodeType
    landmark_description: str | None
    lat: float
    lng: float


class ResolveRequest(BaseModel):
    """Body for POST /resolve -- turn free text into stop candidates a
    commuter can pick from, before routing runs (see 'the two closest bus
    stops' picker flow)."""

    text: str


class ResolveResponse(BaseModel):
    display_name: str
    candidates: list[NodeCandidate]
