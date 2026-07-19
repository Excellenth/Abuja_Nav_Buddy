-- Migration 002: landmark-aware descriptions + Overture Maps tables.
-- Run this AFTER db/schema.sql, against the same database.
--
-- Adds:
--   1. nodes.landmark_description -- "opposite Zenith Bank" style venue
--      reference, shown alongside the bare stop name in every trip
--      description (see app/services/ai.py). Auto-filled from the
--      nearest Overture place when not set manually.
--   2. 'estimated' as a valid data_source -- for edges the app creates
--      automatically when a new stop is connected to the network (see
--      app/services/network.py), as distinct from 'osm' / 'manual' /
--      'crowdsourced' data a human actually verified. Never silently
--      presented as field-verified.
--   3. overture_places / overture_road_segments -- loaded by
--      etl/overture/ from Overture's public GeoParquet
--      release (DuckDB spatial+httpfs, no GeoPandas).

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS landmark_description TEXT;

ALTER TYPE data_source ADD VALUE IF NOT EXISTS 'estimated';

CREATE TABLE IF NOT EXISTS overture_places (
    place_id     TEXT PRIMARY KEY,           -- Overture GERS id
    name         TEXT,
    category     TEXT,                       -- primary category, e.g. 'bank', 'marketplace'
    geom         GEOGRAPHY(Point, 4326) NOT NULL,
    confidence   DOUBLE PRECISION,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS overture_places_geom_idx ON overture_places USING GIST (geom);
CREATE INDEX IF NOT EXISTS overture_places_category_idx ON overture_places (category);

CREATE TABLE IF NOT EXISTS overture_road_segments (
    segment_id   TEXT PRIMARY KEY,           -- Overture GERS id
    road_class   TEXT,                       -- e.g. 'primary', 'residential'
    name         TEXT,
    geom         GEOGRAPHY(LineString, 4326) NOT NULL,
    imported_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS overture_road_segments_geom_idx ON overture_road_segments USING GIST (geom);
