-- Transport graph schema: PostgreSQL + PostGIS (no pgRouting).
-- Pilot scope: single corridor (Galadimawa - Apo Bridge - OSGOF).
-- Designed to scale to city-wide / multi-city without structural changes.
--
-- Routing (Dijkstra/A*) runs in application code (see
-- app/services/routing.py), not in SQL. pgRouting is a performance
-- convenience for graphs far larger than this one -- at
-- single-corridor-to-single-city scale (dozens to low-thousands of
-- nodes), pulling nodes/edges into Python and running Dijkstra there is
-- simpler to install (plain PostGIS, no pgRouting native-Windows
-- headaches) and just as fast in practice.
--
-- Run this file first, then db/002_landmarks_and_overture.sql.
-- See backend/README.md "Local setup" for the exact pgAdmin steps.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- fuzzy text match for destination lookups (e.g. "OSGOF" typos)

-- ---------------------------------------------------------------------
-- NODES: only real transport infrastructure -- bus stops, taxi parks,
-- junctions, bridges, transfer points. Destinations/landmarks (OSGOF,
-- markets, offices) are NOT stored here: they're resolved on demand by
-- geocoding and then snapped to the nearest node below (see
-- `destinations` table and routing_examples.sql). Keeping the two
-- separate means this table only ever holds places you've actually
-- ground-truthed as boardable/transferable, which is the part no
-- geocoder can give you for free.
-- ---------------------------------------------------------------------
CREATE TYPE node_type AS ENUM (
    'loading_point',    -- where commuters board a specific mode (taxi park, okada stage)
    'junction',         -- road junction with no formal loading point but used as a reference
    'transfer_point',   -- where commuters switch modes/vehicles
    'bridge'
);

CREATE TYPE data_source AS ENUM ('osm', 'manual', 'crowdsourced');

CREATE TABLE nodes (
    node_id      BIGSERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    aliases      TEXT[] DEFAULT '{}',        -- local names/misspellings commuters actually use
    node_type    node_type NOT NULL,
    geom         GEOGRAPHY(Point, 4326) NOT NULL,
    osm_id       BIGINT,                     -- null unless source = 'osm'
    source       data_source NOT NULL DEFAULT 'manual',
    verified_at  TIMESTAMPTZ,                -- last time a human confirmed this is still accurate
    notes        TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX nodes_geom_idx ON nodes USING GIST (geom);
CREATE INDEX nodes_aliases_idx ON nodes USING GIN (aliases);

-- ---------------------------------------------------------------------
-- DESTINATIONS: a cache of geocoded places (offices, markets, schools,
-- any free-text place a user typed or a pin they dropped). This is
-- NOT part of the routable graph -- it exists purely so we don't
-- re-call a geocoding API for "OSGOF" every single time someone asks
-- for it. The application resolves a destination here first, falls
-- back to a live geocoding call on a cache miss, then snaps the
-- resulting point to the nearest row in `nodes` for actual routing.
-- ---------------------------------------------------------------------
CREATE TABLE destinations (
    destination_id BIGSERIAL PRIMARY KEY,
    query_text      TEXT NOT NULL,        -- raw text the user typed, e.g. "OSGOF"
    resolved_name   TEXT NOT NULL,        -- canonical name from the geocoder
    geom            GEOGRAPHY(Point, 4326) NOT NULL,
    resolved_via    TEXT NOT NULL,        -- 'osm_nominatim' | 'google_geocoding' | 'manual_pin'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX destinations_geom_idx ON destinations USING GIST (geom);
CREATE INDEX destinations_query_text_idx ON destinations USING GIN (query_text gin_trgm_ops);

-- ---------------------------------------------------------------------
-- EDGES: transport links between nodes.
-- pgRouting's pgr_dijkstra / pgr_astar expect integer source/target ids
-- and a numeric cost column, so `source`/`target` map directly to
-- nodes.node_id. Because different queries optimize for different
-- things (fastest / cheapest / fewest transfers), we store the raw
-- attributes here and compute `cost` per-query rather than baking in
-- one fixed weight (see routing_examples.sql).
-- ---------------------------------------------------------------------
CREATE TYPE transport_mode AS ENUM (
    'shared_taxi',
    'okada',        -- motorcycle
    'keke_napep',   -- tricycle
    'minibus',
    'walk'
);

CREATE TYPE edge_direction AS ENUM ('bidirectional', 'one_way');

CREATE TABLE edges (
    edge_id           BIGSERIAL PRIMARY KEY,
    source            BIGINT NOT NULL REFERENCES nodes(node_id),
    target            BIGINT NOT NULL REFERENCES nodes(node_id),
    mode              transport_mode NOT NULL,
    fare_min          NUMERIC(10,2),          -- NULL for walk
    fare_max          NUMERIC(10,2),
    avg_time_min      NUMERIC(6,2) NOT NULL,  -- primary "cost" for fastest-route queries
    reliability       SMALLINT CHECK (reliability BETWEEN 1 AND 5), -- 5 = always available
    operating_hours   TEXT,                   -- e.g. '06:00-21:00'; free text at MVP
    direction         edge_direction NOT NULL DEFAULT 'one_way', -- only claim bidirectional once you've ridden both directions
    road_condition    TEXT,
    geom              GEOGRAPHY(LineString, 4326), -- optional, for map rendering of the path
    source_data       data_source NOT NULL DEFAULT 'manual',
    sample_count      INT NOT NULL DEFAULT 1,      -- how many field observations fare_min/fare_max/avg_time_min are built from
    verified_at       TIMESTAMPTZ,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT edges_no_self_loop CHECK (source <> target)
);

CREATE INDEX edges_source_idx ON edges (source);
CREATE INDEX edges_target_idx ON edges (target);
CREATE INDEX edges_mode_idx ON edges (mode);
CREATE INDEX edges_geom_idx ON edges USING GIST (geom);

-- Reverse cost defaults to the forward cost for bidirectional edges,
-- and to an unreachable value for one_way edges, matching what
-- pgr_dijkstra expects when given a reverse_cost column.
CREATE VIEW edges_routable AS
SELECT
    edge_id AS id,
    source,
    target,
    mode,
    fare_min,
    fare_max,
    avg_time_min AS cost,
    CASE WHEN direction = 'bidirectional' THEN avg_time_min ELSE -1 END AS reverse_cost,
    reliability,
    operating_hours
FROM edges;
