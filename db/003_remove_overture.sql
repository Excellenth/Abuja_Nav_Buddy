-- Migration 003: remove Overture Maps tables.
-- Run this AFTER db/002_landmarks_and_overture.sql, against the same database.
--
-- Reverses the overture_places / overture_road_segments tables added in
-- migration 002. Decision: the project settled on OSM (via the Overpass
-- API) as the only external map data source -- Overture Maps ingestion
-- (etl/overture/, DuckDB+S3) has been removed. See PROJECT_DECISIONS.md
-- ("Removing Overture Maps") for why.
--
-- Does NOT touch nodes.landmark_description or the 'estimated' data_source
-- value added in the same migration -- those are general-purpose and still
-- in use (landmark_description is now manual-entry only, since its
-- auto-fill source was Overture).

DROP TABLE IF EXISTS overture_places;
DROP TABLE IF EXISTS overture_road_segments;
