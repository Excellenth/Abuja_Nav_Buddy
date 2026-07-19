"""
Two distinct, deliberately separate Claude uses:

1. parse_trip_query() -- ONE-SHOT EXTRACTION. Turns a commuter's raw
   question into the structured TripQuery fields the deterministic
   routing engine (app/services/routing.py) executes. Claude never sees
   the graph, never invents a fare/time/route, and never answers the
   question -- it only fills in a schema. Ported from the original
   ai/parse_query.py.

2. refine_description() -- POST-ROUTING REFINEMENT (the new "chat"
   capability). Runs strictly AFTER plan_trip() has already computed the
   real distance/fare/time from PostGIS + Dijkstra. Claude rewrites how
   the steps are described (landmark-aware, conversational, can take a
   follow-up like "make it shorter") but is explicitly instructed never
   to alter the numbers it's given -- the GIS layer remains the only
   source of truth for distance/fare/time, same "safe failure over
   invented answer" principle as (1).
"""

from typing import Literal

import anthropic
from pydantic import BaseModel, Field

from app.config import settings
from app.schemas.chat import ChatMessage
from app.schemas.trip import TripResponse

_client: anthropic.Anthropic | None = None


def _client_or_raise() -> anthropic.Anthropic:
    global _client
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set -- see backend/.env.example")
    if _client is None:
        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


# ---------------------------------------------------------------------
# 1) Intent extraction (unchanged from ai/parse_query.py)
# ---------------------------------------------------------------------
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


PARSE_SYSTEM_PROMPT = """You extract structured trip-planning parameters from a commuter's
question about public transport in Abuja, Nigeria. You do not answer the
question, describe a route, or state a fare or time -- you only fill in the
TripQuery fields from what the commuter actually said. If a field isn't
mentioned, use its default. Never invent an origin or destination the
commuter didn't name."""


def parse_trip_query(user_text: str) -> TripQuery:
    response = _client_or_raise().messages.parse(
        model="claude-opus-4-8",
        max_tokens=1024,
        system=PARSE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_text}],
        output_format=TripQuery,
    )
    return response.parsed_output


# ---------------------------------------------------------------------
# 2) Post-routing description refinement (new)
# ---------------------------------------------------------------------
REFINE_SYSTEM_PROMPT = """You describe a public-transport trip in Abuja, Nigeria to a
commuter, in plain conversational English.

You are given the trip's steps as already-computed FACTS -- mode, from/to
stop names (each with a landmark reference like "opposite Zenith Bank"
where available), distance, fare, and time. These numbers come from a
GIS routing engine, not from you. NEVER change, round differently, add,
or omit a fare/time/distance number that was given to you. Your job is
only to describe the journey clearly and mention the landmark for every
stop named, so someone unfamiliar with the formal stop names can still
recognize where to board and alight (e.g. "board at Utako, opposite
Zenith Bank" rather than just "board at Utako").

If the user's message asks you to adjust the description (shorter,
friendlier, avoid a word, etc.), follow that instruction while keeping
every number unchanged. If they ask a question the trip data can't
answer, say so plainly rather than guessing."""


def _format_trip_facts(trip: TripResponse) -> str:
    lines: list[str] = []
    for i, step in enumerate(trip.steps, 1):
        from_label = f"{step.from_name}" + (f" ({step.from_landmark})" if step.from_landmark else "")
        to_label = f"{step.to_name}" + (f" ({step.to_landmark})" if step.to_landmark else "")
        tag = " [ESTIMATED -- not yet field-verified, time/mode may be wrong]" if step.estimated else ""
        if step.type == "walk":
            lines.append(f"{i}. WALK from {from_label} to {to_label}, ~{step.distance_m:.0f}m")
        else:
            fare = f"₦{step.fare_ngn:.0f}" if step.fare_ngn else "fare not yet field-verified"
            lines.append(
                f"{i}. RIDE {step.mode} from {from_label} to {to_label}, "
                f"~{step.time_min:.0f} min, {fare}{tag}"
            )
    fare_line = f"~₦{trip.total_fare_ngn:.0f}" if trip.total_fare_ngn is not None else "not fully known yet (some legs unverified)"
    lines.append(f"TOTAL: {fare_line}, ~{trip.total_time_min:.0f} min, {trip.leg_count} leg(s)")
    if trip.includes_estimated_legs:
        lines.append(
            "NOTE: this trip includes at least one ESTIMATED leg -- mention plainly that part of "
            "this route hasn't been field-verified yet and times/fares there are a rough guess."
        )
    return "\n".join(lines)


def refine_description(trip: TripResponse, message: str, history: list[ChatMessage]) -> str:
    if not trip.found:
        return trip.message or "No route was found for this trip."

    facts = _format_trip_facts(trip)
    messages: list[dict] = [
        {"role": "user", "content": f"Here is the computed trip data:\n\n{facts}\n\nDescribe this trip."}
    ]
    for turn in history:
        messages.append({"role": turn.role, "content": turn.content})
    if message:
        messages.append({"role": "user", "content": message})

    response = _client_or_raise().messages.create(
        model="claude-opus-4-8",
        max_tokens=1024,
        system=REFINE_SYSTEM_PROMPT,
        messages=messages,
    )
    return "".join(block.text for block in response.content if block.type == "text")
