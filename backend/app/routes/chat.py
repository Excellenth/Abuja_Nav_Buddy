from fastapi import APIRouter, HTTPException

from app.schemas.chat import ChatMessage, ChatRequest, ChatResponse
from app.services.ai import refine_description

router = APIRouter(tags=["chat"])


@router.post("/chat", response_model=ChatResponse)
def chat_endpoint(req: ChatRequest):
    """Refine a trip's description in plain language. `req.trip` must be a
    TripResponse already produced by POST /trip, /ask, or /trip/from-nodes
    -- this endpoint never computes a route itself, only rewrites how an
    already-computed one is described (see app/services/ai.py's module
    docstring for why that split matters)."""
    try:
        reply = refine_description(req.trip, req.message, req.history)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))

    history = [*req.history]
    if req.message:
        history.append(ChatMessage(role="user", content=req.message))
    history.append(ChatMessage(role="assistant", content=reply))
    return ChatResponse(reply=reply, history=history)
