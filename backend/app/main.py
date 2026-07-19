"""
Abuja Transit MVP API -- modular FastAPI app.

Run locally (no Docker -- see backend/README.md for the native PostgreSQL
18 + PostGIS setup):
  cd backend
  .venv\\Scripts\\activate  (Windows)  /  source .venv/bin/activate  (macOS/Linux)
  uvicorn app.main:app --reload --port 8000

Endpoints:
  POST /trip            {"origin_text", "destination_text", "optimize_for", ...}
  POST /trip/from-nodes  {"origin_node_id", "destination_node_id", ...}  -- after a picker confirms a stop
  POST /ask              {"question": "..."}  -- Claude extracts intent, then routes deterministically
  POST /resolve           {"text": "..."}  -- nearest-stop candidates for a picker UI
  GET  /nodes/nearby      ?lat=&lng=&limit=  -- nearest-stop candidates from a raw coordinate
  POST /nodes             add a new bus stop, auto-connect it to the network
  POST /chat              refine an already-computed trip's description (landmark-aware)
  GET  /health
"""

import logging
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.logging_config import setup_logging

if sys.platform == "win32":
    # Windows console defaults (cp1252) can't print the naira sign. logging's
    # default StreamHandler writes to stderr, not stdout -- both need reconfiguring,
    # or unencodable characters get silently backslash-escaped instead of printed.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

setup_logging()
logger = logging.getLogger(__name__)

from app.routes import chat, health, nodes, trip  # noqa: E402

app = FastAPI(title="Abuja Transit MVP API", version="0.2.0")
logger.info("Abuja Transit MVP API starting up")

# The Frontend (TanStack Start dev server) calls this API directly from the
# browser -- allow local dev origins. Tighten this to the real deployed
# frontend origin before shipping past the pilot.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:5173", "http://127.0.0.1:8080"],
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(trip.router)
app.include_router(nodes.router)
app.include_router(chat.router)
