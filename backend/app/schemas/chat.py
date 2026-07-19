from typing import Literal

from pydantic import BaseModel

from app.schemas.trip import TripResponse


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    """Refine a trip's description in plain language, after the GIS layer
    has already computed the real route/distance/fare (see
    app/services/routing.py). The AI never re-derives or alters the
    numbers -- it only rewrites how the steps are described, optionally
    steered by `message` (e.g. "make it shorter", "I don't like keke")
    and/or `history` for a multi-turn refinement chat."""

    trip: TripResponse
    message: str = ""
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str
    history: list[ChatMessage]
