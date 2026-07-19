# Abuja Transit MVP -- Backend

FastAPI + PostgreSQL/PostGIS backend for informal-transit trip planning in
Abuja, FCT. No Docker, no GeoPandas, no pgRouting -- see "Why these
choices" below for the reasoning behind each of those.

## Local setup (native PostgreSQL, no Docker)

Requires PostgreSQL 18 already installed and running locally (the
PostGIS extension ships with the standard Windows installer's Stack
Builder / is bundled in most package-manager installs).

**1. Create the app database + role.** In pgAdmin's Query Tool (connected
to your PostgreSQL 18 server):

```sql
CREATE ROLE transit WITH LOGIN PASSWORD 'transit_dev_local';
CREATE DATABASE transit OWNER transit;
```

Then connect to the new `transit` database and run:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**2. Load the schema.** Still in the `transit` database's Query Tool, run
`db/schema.sql`, `db/002_landmarks_and_overture.sql`, then
`db/003_remove_overture.sql`, in that order (open each file, paste,
execute).

**3. Python environment.**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**4. Configure secrets.**

```powershell
copy .env.example .env
# edit .env: DATABASE_URL (matches the role/db from step 1),
# ANTHROPIC_API_KEY (from console.anthropic.com/settings/keys)
```

**5. Run it.**

```powershell
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000/docs` for interactive API docs.

## Project layout

`backend/`, `db/`, and `etl/` are top-level siblings (alongside `Frontend/`
and `playground/`), not nested under `backend/` -- `db/` holds the
SQLAlchemy models + CRUD functions shared by both `backend/` and `etl/`
(they don't share a venv or a process, just this code), so it's the single
source of truth for the schema in Python. See `db/README.md`.

```
backend/
  app/
    main.py       FastAPI app, CORS, router registration
    config.py     Settings (.env-backed)
    database.py   SQLAlchemy engine/session, get_db() dependency
    schemas/      Pydantic request/response models
    services/     Business logic: routing (Dijkstra), geocoding, network
                  "leveling", AI (Claude query parsing + chat refinement)
    routes/       Thin FastAPI routers -- HTTP layer only
  scripts/
    simulate_routing.py     Dependency-free routing demo, no DB required
  tests/
db/
  models/                            SQLAlchemy + GeoAlchemy2 ORM models (mirror schema.sql)
  crud/                              DB access functions -- no HTTP, no algorithms, just reads/writes
  schema.sql                         Canonical schema (run first)
  002_landmarks_and_overture.sql     Migration: landmarks + Overture tables (Overture part later reverted)
  003_remove_overture.sql            Migration: drops the Overture tables added in 002
  routing_examples.sql               Reference pgr_dijkstra queries (historical -- not used at runtime)
etl/
  osm/         extract.py (Overpass API query) + load.py (seed the destinations cache)
  field_data/  extract.py (CSV read) + load.py (upsert into nodes/edges)
  data/
    field_data_template.csv    Copy this to log a field survey
  run.py       Single CLI entry point for both pipelines -- see "Running the ETL pipelines" below
```

## Running the ETL pipelines

Both pipelines share one CLI (`etl/run.py`), each extracting from a
different source and loading into a different part of the schema:

```powershell
# OSM (Overpass API): transit-tagged points (bus stops, taxi ranks) -> destinations cache
# (never into `nodes` -- see etl/osm/extract.py)
python etl/run.py osm

# Field survey CSV -> nodes/edges (the only source of real fares/times -- see etl/field_data/extract.py)
python etl/run.py field-data data/your_survey.csv
```

Each subcommand extracts first, then writes everything in a single
transaction (commit on success, rollback on any error) -- a failed run
never leaves the graph half-updated. Safe to re-run either: field-data
upserts merge by proximity rather than duplicating, and the OSM loader
skips points already in the cache.

## API surface

| Endpoint | Purpose |
|---|---|
| `POST /trip` | Plan a trip from free-text origin/destination |
| `POST /trip/from-nodes` | Plan a trip between two already-confirmed stop ids |
| `POST /ask` | Same as `/trip`, but intent is extracted from a natural-language question via Claude |
| `POST /resolve` | Free text -> nearest stop candidates, for a "which stop do you mean?" picker |
| `GET /nodes/nearby` | Nearest stop candidates from a raw lat/lng |
| `POST /nodes` | Add a new bus stop and auto-connect it to nearby stops ("leveling" -- see below) |
| `POST /chat` | Refine an already-computed trip's description in plain language |
| `GET /health` | Liveness check |

**Destination resolution order** (`app/services/geocode.py`): exact node/alias
match -> `destinations` cache (includes OSM/Overpass transit points from
`etl/osm/`) -> live Nominatim as the last resort.

## Why these choices

**PostGIS, not pgRouting.** At pilot scale (dozens to low-thousands of
nodes), pulling the edge list into Python once per request and running
Dijkstra in-process (`app/services/routing.py`) is simpler to deploy than
installing pgRouting, and just as fast in practice. `db/routing_examples.sql`
keeps the equivalent `pgr_dijkstra` queries as a reference for when the
graph outgrows this.

**SQLAlchemy + GeoAlchemy2, not raw psycopg2 or GeoPandas.** The ORM layer
gives the modular crud/models/schemas structure real type safety and a
single place to see the schema in Python. Geometry never leaves PostGIS as
a dataframe -- every spatial operation (nearest-neighbor, distance,
snapping) is a SQL function (`ST_Distance`, the `<->` KNN operator, etc.)
called through GeoAlchemy2, not computed client-side.

**"Leveling" a new stop (`POST /nodes`).** Adding a stop like "Gwarinpa
City Gate" that isn't in OSM or your field data yet: the endpoint creates
its node, finds the nearest existing stops via PostGIS KNN, and connects
them with a distance-estimated edge (`app/services/network.py`). These
edges are tagged `source_data='estimated'` and never carry a fare --
they're routable immediately but clearly flagged as unverified until
someone actually rides the leg and `etl/field_data/` overwrites the
estimate with a real observation.

**OSM via a dedicated ETL package, not GeoPandas.** `etl/osm/extract.py`
queries the Overpass API directly for transit-tagged points (bus stops,
taxi ranks) in the FCT bbox, replacing what used to be a manual
copy-a-query-into-overpass-turbo.eu workflow. It has a clean extract/load
split (`extract.py` pulls raw rows, `load.py` upserts them into the
`destinations` cache, `etl/run.py` wires them together) so adding another
source later doesn't mean restructuring this one. An earlier version of
this project also ingested Overture Maps places/road-segments via DuckDB
+ S3 (`etl/overture/`); that pipeline and its tables were removed in favor
of OSM/Overpass as the sole external map data source -- see
`PROJECT_DECISIONS.md` for why.

**Landmark-aware descriptions, manual entry.** Every stop a trip step
names can carry a `landmark_description` alongside the bare name (e.g.
"board at Utako, opposite Zenith Bank") -- see `TripStep` in
`app/schemas/trip.py`. This used to auto-fill from the nearest ingested
Overture place; since Overture was removed, it's manual-entry only via
`POST /nodes`.

**The `/chat` endpoint never re-derives the route.** `POST /chat` takes an
already-computed `TripResponse` (from `/trip`, `/ask`, or
`/trip/from-nodes`) and only rewrites *how* it's described. The distance,
fare, and time are frozen facts handed to Claude in the prompt; the system
prompt explicitly forbids changing them. This mirrors the same
"deterministic routing, LLM only for language" split as `/ask`'s intent
extraction -- Claude never gets to invent a number.
