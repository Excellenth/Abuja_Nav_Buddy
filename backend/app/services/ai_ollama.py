"""
Offline alternative to ai.py's parse_trip_query(): same TripQuery schema,
same job (turn a commuter's raw question into structured routing
parameters, never answer the question itself), but using a locally-hosted
Ollama model instead of the Claude API.

Why this exists: no API key needed, no internet dependency, no per-request
cost, and it can run as a genuine offline fallback. Trade-off: local
models are generally less reliable than Claude on messy/colloquial
phrasing -- worth validating on real commuter questions before relying on
it for anything user-facing.

Requires: Ollama running locally with a tool-calling-capable model, e.g.
  ollama pull gpt-oss:20b

NOTE: calls Ollama's native /api/chat directly (not the OpenAI-compatible
shim) so we can force `num_gpu: 0` when needed -- see FORCE_CPU_ONLY.
"""

import json
from typing import Literal

import requests
from pydantic import BaseModel, Field

OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
FORCE_CPU_ONLY = True  # flip off once your GPU/driver combo is confirmed stable for this model


class TripQuery(BaseModel):
    origin_text: str = Field(
        description="Where the commuter is starting from, exactly as they described it, e.g. 'Galadima Bridge'"
    )
    destination_text: str = Field(
        description="Where the commuter wants to go, exactly as they described it, e.g. 'OSGOF'"
    )
    optimize_for: Literal["fastest", "cheapest", "fewest_transfers"] = Field(
        default="fastest",
        description="What the commuter wants to minimize. Default to fastest unless they ask for cheapest or fewest transfers/rides.",
    )
    avoid_modes: list[Literal["okada", "keke_napep", "minibus", "shared_taxi"]] = Field(
        default_factory=list,
        description="Transport modes to exclude entirely, e.g. ['okada'] if they say 'avoid motorcycles'.",
    )
    has_luggage: bool = Field(
        default=False,
        description="True if the commuter mentions luggage/bags -- this excludes okada and low-reliability edges.",
    )
    direct_only: bool = Field(
        default=False,
        description="True only if they explicitly ask for a direct route / no transfers (e.g. 'is there a direct taxi?').",
    )


TOOL_SCHEMA = {
    "type": "function",
    "function": {
        "name": "extract_trip_query",
        "description": "Extract structured trip-planning parameters from a commuter's question about public transport in Abuja, Nigeria.",
        "parameters": TripQuery.model_json_schema(),
    },
}

SYSTEM_PROMPT = """You extract structured trip-planning parameters from a commuter's
question about public transport in Abuja, Nigeria. You do not answer the
question, describe a route, or state a fare or time -- you only fill in the
extract_trip_query fields from what the commuter actually said. If a field
isn't mentioned, use its default. Never invent an origin or destination the
commuter didn't name. Always respond by calling the extract_trip_query tool.

avoid_modes and any mode fields MUST use exactly these four values, never
any other word (never write "motorcycle", "bike", "taxi", "bus", etc.):
- "okada" (motorcycle / bike)
- "keke_napep" (tricycle / keke)
- "minibus" (bus / minibus)
- "shared_taxi" (taxi / cab / shared taxi)
Map the commuter's words to these exact values. For example "avoid
motorcycles" -> avoid_modes: ["okada"]. "no bikes" -> avoid_modes: ["okada"]."""


def parse_trip_query(user_text: str, model: str = "gpt-oss:20b") -> TripQuery:
    payload = {
        "model": model,
        "stream": False,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_text},
        ],
        "tools": [TOOL_SCHEMA],
    }
    if FORCE_CPU_ONLY:
        payload["options"] = {"num_gpu": 0}

    response = requests.post(OLLAMA_CHAT_URL, json=payload, timeout=120)
    response.raise_for_status()
    message = response.json()["message"]

    tool_calls = message.get("tool_calls")
    if tool_calls:
        args = tool_calls[0]["function"]["arguments"]
        return TripQuery(**args)

    # Reliability quirk: this model sometimes gets the content exactly
    # right but delivers it as plain text instead of a proper tool call.
    # Rather than treat that as a hard failure, try to parse the text as
    # the JSON it's supposed to be -- only give up if that also fails.
    content = message.get("content", "")
    try:
        return TripQuery(**json.loads(content))
    except (json.JSONDecodeError, TypeError):
        raise RuntimeError(
            f"Model didn't call extract_trip_query and its text reply wasn't valid JSON either: {content!r}"
        )
