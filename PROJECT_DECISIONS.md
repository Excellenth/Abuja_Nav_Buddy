# Abuja Transit — Project Decisions

This document exists so the owner (and anyone else who picks this project
up) can see *why* the codebase looks the way it does, not just what it
does. It covers both halves of the project — `Frontend/` and `backend/` —
and the reasoning behind the tools and structures chosen for each,
in roughly the order decisions were made.

---

## The two halves

- **`Frontend/`** — a TanStack Start (React) app, originally prototyped in
  Lovable, that's the commuter-facing trip planner: search a place, get
  multi-stop directions with fare/mode estimates, plan a whole day in one
  go, save outings.
- **`backend/`** — a FastAPI + PostgreSQL/PostGIS service that models
  Abuja's *informal* transit network (okada, keke napep, shared taxi,
  minibus — not a fixed-schedule system) as a routable graph, built for
  an OSM/Overture Maps data competition.

They are not wired together yet — the Frontend currently plans routes
client-side with straight-line-distance heuristics
(`Frontend/src/lib/plan-trip.ts`); the backend is the real, field-verified
routing engine intended to eventually replace that heuristic. Keeping them
decoupled during this build was deliberate: the Frontend's existing JSON
data and client-side planner were left completely untouched throughout
the backend work — nothing there needed to move or break for the backend
to exist alongside it.

---

## Frontend

### Starting point

The app was cloned from a Lovable-generated GitHub repo
(`Excellenth/abuja-nav-buddy`) — a TanStack Start + React 19 + Tailwind v4
scaffold with shadcn-style UI components, Leaflet for maps, and a
single-page trip planner already wired to OpenStreetMap (Nominatim
search, OSRM routing preview). Lovable's own AI voice-search endpoint
(`/api/stt`) was already broken outside the Lovable platform — it called
Lovable's private AI gateway, which needs a key only Lovable issues.

### Navigation: three tabs, not one page

The original app was a single page. It became three, via a persistent
bottom tab bar (`Frontend/src/components/BottomNav.tsx`):

| Tab | Route | Purpose |
|---|---|---|
| **Navigator** | `/` | The original manual trip planner (pick stops, get directions) |
| **Day Planner** | `/day-planner` | Describe a whole day in free text or voice; AI extracts stops, resolves them, computes the route, and auto-saves it |
| **Saved Outings** | `/saved-outings` | Previously planned/saved trips |

Two decisions worth calling out:

- **"History" became "Saved Outings", not two concepts.** An earlier
  design had a separate "recent trips" history list alongside "saved
  outings" (mirroring the plans/history split already in
  `lib/trip-storage.ts`). The owner explicitly didn't want a History tab —
  just outings they'd actually saved — so the recent-history concept
  (`getHistory`/`addToHistory`/`removeHistory`, the `HistoryList`
  component, and the call site in Navigator's `onGo`) was removed
  entirely rather than kept-but-hidden. One list, one meaning.
- **Voice search stays on Day Planner, not Navigator.** Day Planner's
  whole premise is "describe your day, spoken or typed" — voice is the
  point. Navigator's per-stop search fields had voice search too
  (inherited from the Lovable scaffold), which was removed there
  specifically per instruction — `PlacePicker` now takes a
  `voiceEnabled` prop, defaulting on, explicitly turned off only on
  Navigator's stop inputs.

### Day Planner: what "AI-powered" actually means here

The ask was: describe a day ("today I go clinic, from there to Maitama to
see my sis...") and have it planned, saved, and turned into movement
advice — not just parsed into a form.

The pipeline (`Frontend/src/routes/day-planner.tsx` +
`src/routes/api/plan-itinerary.ts`):

1. **Extraction is structured, not free-form.** The itinerary text is
   sent to Claude (`claude-opus-4-8`) with a JSON-schema-constrained
   output (`output_config: {format: {type: "json_schema", ...}}`) — an
   ordered list of `{query, label, resolvable}`. Claude never invents a
   route or a fare; it only extracts what the user actually said, and
   flags vague references ("home", "my sister's house") as
   `resolvable: false` rather than guessing a location for them.
2. **Resolution happens client-side, not in the LLM call.** Each
   extracted stop is geocoded via the existing Nominatim-based
   `searchPlaces()`; a stop the model marked `resolvable: false` is left
   for the user to fill in manually via the same search/current-location/
   map-pick UI Navigator already uses.
3. **"Save everything, then advise on movement" is one action, not two.**
   Earlier versions handed the confirmed stops off to Navigator to
   compute directions and save separately. That was changed: Day
   Planner's "Plan my movements" button now computes the full route
   in-page, auto-saves it as an outing (auto-named "Friday's plan: A → B"),
   and renders the same step-by-step mode/fare breakdown Navigator shows
   — because the owner's framing was explicitly "plan it and save
   everything, then... tell you how you move," not a multi-page handoff.

**Why the raw-JSON-schema approach instead of Zod-based structured
output:** the installed `zod` version (v3, required elsewhere in the app
for `react-hook-form`) is incompatible with `@anthropic-ai/sdk`'s
`zodOutputFormat` helper, which expects Zod v4 internals. Upgrading Zod
app-wide to unblock one endpoint wasn't worth the risk; a hand-written
JSON Schema passed directly to `output_config.format` gets the same
guaranteed-valid-JSON behavior without touching the Zod version at all.

**Why Claude, not a rule-based parser:** discussed with the owner
directly — a rule-based ("split on 'then'/'from there'") parser was the
zero-cost option, but the owner chose the LLM-based path for better
extraction quality on messy, colloquial phrasing.

### Fuzzy location search

Plain `.includes()` substring matching against the curated Abuja places
list meant a small typo returned nothing. `Frontend/src/lib/geocode.ts`
now scores candidates by exact-substring position first, then falls back
to an in-order subsequence match (the same idea as a fuzzy file-finder)
so "mtama" still surfaces "Maitama." On the remote side, a Nominatim
query that returns nothing inside the strict Abuja viewbox is retried
without the bounding restriction, so near-misses and off-viewbox spellings
still surface a suggestion instead of nothing.

### State persistence across tabs

Switching tabs used to blow away whatever the user had typed or selected
on Navigator or Day Planner, because TanStack Router unmounts a route's
component when you navigate away. `lib/trip-storage.ts` gained a generic
`getDraft`/`setDraft` pair backed by `sessionStorage` (survives tab
switches within the session, clears when the tab actually closes); both
Navigator and Day Planner hydrate from their draft on mount and write to
it on every change, but an explicit hand-off (opening a saved outing,
"Open in Navigator" from Day Planner) still takes priority over a stale
draft.

### Branding

The app was renamed from the Lovable-scaffold default ("NaijaNav Abuja")
to **Abuja NavBuddy** (matching the actual GitHub repo name,
`abuja-nav-buddy`) per the owner's request, and the CSS gradient used for
icon backgrounds was replaced with a solid deep green (`bg-primary`) —
"real deep colours, not gradients." Lovable's own branding (meta
`author`, `twitter:site`, and the Lovable-hosted preview image) was
stripped from `__root.tsx`; the functional Lovable-authored pieces (the
`@lovable.dev/vite-tanstack-config` build plugin and the
`lovable-error-reporting.ts` telemetry hook) were left in place since
removing those breaks the build or removes real error-reporting
functionality — "remove the logo," not "remove the tooling this project
still runs on." A new SVG favicon matching the app's own pin-mark icon
replaced the inherited default.

---

## Backend

### Why this exists

The owner is entering an OSM/Overture Maps data competition. The core
technical problem is one Nominatim/OSM alone doesn't solve well:
**informal transit** (okada, keke napep, shared taxi, minibus) barely
exists in OSM as routable data — there's no GTFS feed, no formal stop
registry. The backend's job is to represent that network honestly (fares
as observed ranges, not point estimates; time as a field-measured
average; "verified" vs "estimated" as a first-class distinction) and make
it routable.

### Starting point: a real pilot, not a toy

Before this session's work, a working single-corridor pilot already
existed (Galadimawa Bridge → Apo Bridge → OSGOF → Mararaba) with a
genuinely well-reasoned design already in place:

- A `nodes`/`edges` graph schema in plain PostgreSQL + PostGIS —
  deliberately **not** using pgRouting, with the reasoning documented
  directly in `db/schema.sql`: at pilot scale (dozens to low-thousands of
  nodes), pulling edges into Python once per request and running Dijkstra
  in-process is simpler to deploy (no pgRouting extension install on
  Windows) and just as fast.
- A field-data workflow: ride a leg, log lat/lng + fare + time to a CSV,
  import it — repeatable, and samples on the same leg merge (fare range
  widens, time becomes a running average) rather than duplicate.
- A one-shot LLM intent-extraction step (Claude, with an Ollama fallback
  for offline use) that turns a commuter's question into structured
  routing parameters — and explicitly never generates the answer itself,
  to keep hallucination off the critical path.
- A **"safe failure" principle** running through every layer: an
  unresolvable place raises a typed `ResolutionError` and returns a 404
  with an honest message, never a guessed answer.

This existing work was **preserved and ported, not replaced** — see
"Modularization" below for exactly what moved where.

### Folder consolidation: `backend/`

The pilot's code (`api/`, `ai/`, `db/`, `scripts/`, `data/`,
`docker-compose.yml`) lived scattered at the `Transportation/` root,
sibling to `Frontend/`. Per instruction, it was consolidated into
`Transportation/backend/`, mirroring `Frontend/`'s own top-level folder —
one clear place for each half of the project.

### Modularization: SQLAlchemy + GeoAlchemy2, layered structure

The original `api/main.py` was a thin FastAPI shim calling straight into
`scripts/*.py`, which used raw `psycopg2` cursors. Per instruction, this
was restructured into a conventional layered FastAPI app:

```
app/
  models/     SQLAlchemy ORM models, GeoAlchemy2 Geography columns
  schemas/    Pydantic request/response models
  crud/       DB access functions — no HTTP, no algorithms
  services/   Business logic: routing, geocoding, network "leveling", AI
  routes/     Thin FastAPI routers — HTTP layer only
  config.py   .env-backed settings
  database.py SQLAlchemy engine/session, get_db() dependency
  main.py     App assembly, CORS, router registration
```

The original algorithms were **ported, not rewritten from scratch** —
`app/services/routing.py`'s Dijkstra is the same heapq-based algorithm
from `simulate_routing.py`/`route.py` (with one real bug fix: the
priority-queue tuples now carry a tiebreaker counter, since comparing
unorderable path lists on a cost tie would have raised `TypeError` the
first time two candidates landed on an equal cost — latent in the
original, fixed during the port). `app/services/geocode.py` is the same
exact-match → cache → Nominatim → snap-to-node flow from the original
`geocode.py`. `app/crud/edge.py:upsert`'s merge semantics (widen the fare
range, running-average the time) are unchanged from the original
`import_field_data.py`.

**Still no GeoPandas, and still no pgRouting for routing itself** — those
constraints came from the owner directly, and they line up with the
pilot's own original reasoning. GeoAlchemy2 is used specifically because
it was named as wanted "when important": it gives the model layer real
`Geography` column types and lets spatial queries (`ST_Distance`, the
`<->` k-nearest-neighbor operator, `ST_DWithin`) be expressed through the
ORM's query API instead of hand-written SQL strings, without ever pulling
geometry into a Python dataframe.

### Local database: native PostgreSQL, not Docker

The pilot's `docker-compose.yml` ran `pgrouting/pgrouting` (Postgres +
PostGIS + pgRouting bundled) as the local dev database. The owner doesn't
have Docker on this machine. PostgreSQL 18 was already installed and
running as a Windows service, with the PostGIS 3.6.2 extension already
present — so the local setup path became "create a role/database in
pgAdmin, run the schema SQL directly" instead of `docker compose up`
(see `backend/README.md` → "Local setup"). `docker-compose.yml` was kept
(renamed `.optional`) rather than deleted, in case Docker becomes
available later — it's not in the active path.

One thing worth being explicit about: guessing at database credentials
was refused outright (correctly flagged by the environment's own
safeguards as credential brute-forcing) — the owner was asked to create a
dedicated `transit` role via pgAdmin instead of sharing the Postgres
superuser password, so this document (and the codebase) never needed to
handle a real secret.

### The new features

**1. "Leveling" a new stop into the network — `POST /nodes`.** The
concrete scenario named was adding somewhere like Gwarinpa City Gate as a
bus stop and connecting it to existing stops. `app/services/network.py`
implements this: create the node, find the `k` nearest *existing* stops
via PostGIS k-NN, and connect each with a straight-line-distance-derived
edge (mode chosen by distance band — walk / keke / shared taxi / minibus
— with a documented 1.3× road-indirection fudge factor on top of the
straight line). These edges are explicitly tagged `source_data
='estimated'` and never carry a fare (`fare_min`/`fare_max` stay `NULL`)
— they're routable immediately, but the schema itself makes it impossible
to confuse "a machine's distance guess" with "someone actually rode this
and timed it." Field data collected later
(`scripts/import_field_data.py`) overwrites the estimate via the same
merge logic used for any other field observation.

**2. Overture Maps ingestion — `scripts/ingest_overture.py`.** For the
competition's Overture Maps requirement: DuckDB's `spatial` + `httpfs`
extensions read Overture's public GeoParquet release directly off S3,
bbox-filtered to the Abuja pilot area at the query level — nothing is
downloaded whole, no dataframe ever holds more than what's inside the
box. Two themes are pulled: `places` (named POIs — banks, markets,
clinics — landing in `overture_places`) and `transportation`/`segment`
(road geometry, landing in `overture_road_segments`, held in reserve for
road-network snapping as the graph grows). This is the same
"PostGIS/SQL does the geospatial work, Python only shuttles rows"
principle as the rest of the backend — DuckDB was chosen over GeoPandas
here specifically because Overture's own documentation recommends it for
exactly this bbox-pushdown access pattern.

**3. Landmark-aware descriptions, always.** The owner's example was
literal: "Utako, opposite Zenith Bank," not just "Utako" — because a
formal stop name means little to someone who's never heard it, but a
landmark reference lets them recognize the spot on sight. Every `Node`
gained a `landmark_description` column; when one isn't set manually,
`network.py:describe_landmark` fills it in from the nearest named
Overture place within 400m (worded as "at" / "opposite" / "near"
depending on how close). Every step in a computed trip
(`app/schemas/trip.py:TripStep`) carries `from_landmark`/`to_landmark`
alongside the bare stop name, and the `/chat` refinement prompt
(`app/services/ai.py`) is explicitly instructed to always mention it.

**4. The nearest-stops picker — `GET /nodes/nearby`, `POST /resolve`.**
The owner's point was concrete: don't silently trust "nearest node by
straight-line distance" — show the commuter the two (or more) closest
mapped stops and let them confirm which one they actually recognize.
`crud/node.py:nearest_routable` now returns the top-`k` candidates, not
just the top-1; `POST /resolve` exposes this for free-text input, `GET
/nodes/nearby` for a raw coordinate (GPS position or a map tap). Once a
candidate is confirmed, `POST /trip/from-nodes` routes between two
explicit node ids, bypassing geocoding entirely. The original single-best
behavior wasn't removed — `POST /trip` and `POST /ask` still auto-pick
the nearest match, so existing callers don't break; the picker flow is
additive.

**5. `POST /chat` — AI refinement, strictly after routing.** This is
deliberately the *same* split the original pilot already used for intent
extraction, applied to the output side: the GIS/Dijkstra layer computes
distance, fare, and time first and those numbers are handed to Claude as
frozen facts in the prompt; the system prompt explicitly forbids changing
them. Claude's only job is turning that data into a natural,
landmark-referencing description, and taking a follow-up instruction
("make it shorter," "I don't like keke") without ever being allowed to
alter a number. This mirrors why the original `ai/parse_query.py`
deliberately skipped a second LLM call on the output side in the first
place ("skipping a second LLM call removes cost, latency, and a second
hallucination surface for zero benefit") — the difference now is that a
*refinement* chat has real product value (landmark-aware, conversational,
steerable phrasing) that the original one-shot templating didn't need to
provide, so the second call was added back in, scoped narrowly enough
that it still can't invent a fare or a route.

### What's deliberately not done yet

- **The Frontend and backend aren't connected.** The Frontend's trip
  planner still uses its own client-side straight-line-distance heuristic
  (`Frontend/src/lib/plan-trip.ts`); wiring it to call this backend's
  `/trip` endpoint instead is a follow-up, not part of this build.
- **Road-network snapping still uses straight-line distance + a fudge
  factor** (`network.py:estimate_connection`), not actual road-network
  distance. An earlier version had a hook for this via ingested Overture
  road-segment geometry; that data source was removed (see "Removing
  Overture Maps" below), so this would need a different geometry source
  if it becomes worth doing.

### Removing Overture Maps

The backend originally ingested two external map sources: OSM (via the
Overpass API, `etl/osm/` — always the plan) and Overture Maps (via
DuckDB reading Overture's public GeoParquet release directly off S3,
`etl/overture/`, since removed). Overture supplied `overture_places`
(named landmarks — banks, hotels, churches, ~14K records for the FCT
bbox) and `overture_road_segments` (~145K road geometries), and powered
two features: auto-filled `landmark_description` text ("opposite Zenith
Bank") on new stops, and `GET /nodes/{id}/places` for browsing nearby
businesses.

The owner decided the project should rely on OSM/Overpass alone —
Overture added a second external data source and access pattern (DuckDB
+ S3 vs. plain HTTP requests) for a feature set OSM/Overpass can't fully
replace, and around the same time the owner started **directly
contributing real bus-stop data to OSM** for the FCT (over 250 stops,
visible live via Overpass Turbo) — making OSM the project's actual
primary data source in practice, not just its transit-tag-specific
supplement.

What this removal cost, concretely:
- `overture_places` / `overture_road_segments` tables dropped
  (`db/003_remove_overture.sql`), along with `etl/overture/`,
  `db/models/overture.py`, `db/crud/overture.py`.
- `landmark_description` is now **manual-entry only** (`POST /nodes`) —
  there's no longer an automatic "nearest named place" lookup to draw
  from. The column itself is untouched; only the auto-fill logic
  (`network.py:describe_landmark`) was removed.
- `GET /nodes/{id}/places` ("businesses near this stop") was removed
  entirely — it had no non-Overture data source to fall back to.
- `etl/overture_osm/` was renamed to `etl/osm/` (its `osm` suffix existed
  only to disambiguate from the sibling `etl/overture/`, which no longer
  exists), and its CLI subcommand shortened from `overture-osm` to `osm`.

If OSM coverage for general (non-transit) named places ever proves too
thin for a feature that needs it, re-adding a places source is a
contained change (new `etl/<source>/` pipeline + `db/crud/<source>.py`,
same shape as the removed Overture code) — but it's out of scope unless
that need actually shows up.
