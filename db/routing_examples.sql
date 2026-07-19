-- ------------------------------------------------------------------
-- 0) RESOLVE + SNAP -- run this FIRST, for both origin and destination,
--    before any of the routing queries below.
--
--    A destination like "OSGOF" is not a graph node -- it's a geocoded
--    point (see `destinations` table). To route to/from it, find the
--    nearest node that's actually part of the transport network, using
--    the <-> nearest-neighbor operator (fast, uses the GIST index).
--    The final leg from that node to the real destination point is a
--    walking instruction the application appends, not a graph edge.
-- ------------------------------------------------------------------
SELECT node_id, name, node_type,
       ST_Distance(geom, (SELECT geom FROM destinations WHERE destination_id = :destination_id)) AS walk_distance_m
FROM nodes
WHERE node_type IN ('loading_point', 'transfer_point') -- only snap to boardable nodes, not bare junctions
  AND EXISTS (SELECT 1 FROM edges WHERE edges.source = nodes.node_id OR edges.target = nodes.node_id)
ORDER BY geom <-> (SELECT geom FROM destinations WHERE destination_id = :destination_id)
LIMIT 3; -- return a few candidates -- the closest one isn't always the most sensible (e.g. across a highway)

-- NOTE: queries 1-5 below use pgr_dijkstra (pgRouting), which this
-- project no longer depends on -- see db/schema.sql for why, and
-- scripts/route.py for the Python equivalent that actually runs against
-- the database now. Query 0 above (destination resolve + snap) is plain
-- PostGIS and is still exactly how that step works. Queries 1-5 are kept
-- here only because they're the clearest illustration of the underlying
-- idea -- same edges, five different cost expressions -- which
-- route.py's COST_FUNCTIONS dict implements the same way in Python.

-- Example pgr_dijkstra queries showing how the SAME edges table answers
-- different commuter questions just by changing the cost expression
-- and/or filtering the edge set passed in. This is the mechanism that
-- avoids hand-storing every origin->destination journey: one graph,
-- many cost functions.
--
-- Replace :start_id / :end_id with actual nodes.node_id values.

-- ------------------------------------------------------------------
-- 1) FASTEST ROUTE (default) -- cost = travel time
-- ------------------------------------------------------------------
SELECT * FROM pgr_dijkstra(
    'SELECT edge_id AS id, source, target,
            avg_time_min AS cost,
            CASE WHEN direction = ''bidirectional'' THEN avg_time_min ELSE -1 END AS reverse_cost
     FROM edges',
    :start_id, :end_id,
    directed := true
);

-- ------------------------------------------------------------------
-- 2) CHEAPEST ROUTE -- cost = fare (walk edges cost 0)
-- ------------------------------------------------------------------
SELECT * FROM pgr_dijkstra(
    'SELECT edge_id AS id, source, target,
            COALESCE(fare_min, 0) AS cost,
            CASE WHEN direction = ''bidirectional'' THEN COALESCE(fare_min, 0) ELSE -1 END AS reverse_cost
     FROM edges',
    :start_id, :end_id,
    directed := true
);

-- ------------------------------------------------------------------
-- 3) "AVOID MOTORCYCLES" -- filter the mode out of the edge set entirely
-- ------------------------------------------------------------------
SELECT * FROM pgr_dijkstra(
    'SELECT edge_id AS id, source, target,
            avg_time_min AS cost,
            CASE WHEN direction = ''bidirectional'' THEN avg_time_min ELSE -1 END AS reverse_cost
     FROM edges
     WHERE mode <> ''okada''',
    :start_id, :end_id,
    directed := true
);

-- ------------------------------------------------------------------
-- 4) FEWEST TRANSFERS -- cost = 1 per edge, so Dijkstra minimizes hop count
--    (walking connections at the same stop shouldn't count as a "transfer";
--     model those as a single edge with mode = 'walk' rather than a
--     separate node-splitting scheme, so this stays a flat hop count)
-- ------------------------------------------------------------------
SELECT * FROM pgr_dijkstra(
    'SELECT edge_id AS id, source, target,
            1 AS cost,
            CASE WHEN direction = ''bidirectional'' THEN 1 ELSE -1 END AS reverse_cost
     FROM edges',
    :start_id, :end_id,
    directed := true
);

-- ------------------------------------------------------------------
-- 5) "I HAVE LUGGAGE" / avoid low-reliability edges -- combine a
--    reliability floor with the fastest-route cost
-- ------------------------------------------------------------------
SELECT * FROM pgr_dijkstra(
    'SELECT edge_id AS id, source, target,
            avg_time_min AS cost,
            CASE WHEN direction = ''bidirectional'' THEN avg_time_min ELSE -1 END AS reverse_cost
     FROM edges
     WHERE reliability >= 3
       AND mode <> ''okada''',   -- luggage rarely fits on a motorcycle
    :start_id, :end_id,
    directed := true
);

-- The application layer's job is just to pick which of these cost/
-- filter templates to use based on parsed user intent, then join the
-- resulting path (seq, node, edge) back to `nodes` and `edges` to
-- render the step-by-step instructions and map geometry.
