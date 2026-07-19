"""
Dependency-free simulation of the routing engine's core logic, so we can
prove the IDEA works (one graph, many cost functions, direct-vs-transfer
tradeoffs, safe failure on missing data) before standing up real
PostgreSQL + PostGIS + pgRouting.

This mirrors db/routing_examples.sql exactly -- same nodes/edges shape,
same five cost strategies -- just run with Python's heapq instead of
pgr_dijkstra, so no database install is required to test the concept.

ALL DATA BELOW IS FABRICATED FOR TESTING ONLY -- not real Abuja fares,
times, or coordinates. Do not treat any number here as ground truth.
"""

import heapq
import sys
from dataclasses import dataclass, field

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")  # Windows console defaults can't print the naira sign


@dataclass
class Edge:
    source: str
    target: str
    mode: str
    fare: float
    time_min: float
    reliability: int
    direction: str = "one_way"  # "one_way" | "bidirectional"


# ---------------------------------------------------------------------
# Test graph -- same trio of dots discussed in conversation, plus the
# direct Galadimawa->Mararaba edge to test the direct-vs-transfer case.
# ---------------------------------------------------------------------
EDGES = [
    Edge("Galadimawa Bridge", "Apo Bridge", "shared_taxi", fare=300, time_min=20, reliability=4),
    Edge("Apo Bridge", "OSGOF", "okada", fare=600, time_min=11, reliability=4),
    Edge("Apo Bridge", "Mararaba", "shared_taxi", fare=300, time_min=25, reliability=4),
    # Direct service: passenger never alights at Apo Bridge, so this is its
    # own edge, not a combination of the two edges above.
    Edge("Galadimawa Bridge", "Mararaba", "shared_taxi", fare=700, time_min=35, reliability=3),
]


def build_graph(edges: list[Edge], excluded_modes: set[str], min_reliability: int = 1):
    graph: dict[str, list[Edge]] = {}
    for e in edges:
        if e.mode in excluded_modes or e.reliability < min_reliability:
            continue
        graph.setdefault(e.source, []).append(e)
        if e.direction == "bidirectional":
            graph.setdefault(e.target, []).append(
                Edge(e.target, e.source, e.mode, e.fare, e.time_min, e.reliability, e.direction)
            )
    return graph


def dijkstra(graph, start: str, goal: str, cost_of):
    """cost_of(edge) -> float. Returns (total_cost, path[list[Edge]]) or None."""
    queue = [(0.0, start, [])]
    best = {start: 0.0}
    while queue:
        cost, node, path = heapq.heappop(queue)
        if node == goal:
            return cost, path
        if cost > best.get(node, float("inf")):
            continue
        for edge in graph.get(node, []):
            new_cost = cost + cost_of(edge)
            if new_cost < best.get(edge.target, float("inf")):
                best[edge.target] = new_cost
                heapq.heappush(queue, (new_cost, edge.target, path + [edge]))
    return None


COST_FUNCTIONS = {
    "fastest": lambda e: e.time_min,
    "cheapest": lambda e: e.fare,
    "fewest_transfers": lambda e: 1,
}


def describe(result, label: str):
    print(f"\n--- {label} ---")
    if result is None:
        print("No route found (missing data, or every option was filtered out).")
        return
    cost, path = result
    total_fare = sum(e.fare for e in path)
    total_time = sum(e.time_min for e in path)
    for i, e in enumerate(path, 1):
        mode_label = {"shared_taxi": "shared taxi", "okada": "okada", "keke_napep": "keke napep"}.get(e.mode, e.mode)
        print(f"  {i}. Take {mode_label} from {e.source} to {e.target} (~₦{e.fare:.0f}, ~{e.time_min:.0f} min)")
    print(f"  => {len(path)} leg(s), ~₦{total_fare:.0f} total, ~{total_time:.0f} min total")


def run(origin, destination, optimize_for="fastest", avoid_modes=None, has_luggage=False):
    excluded = set(avoid_modes or [])
    min_reliability = 3 if has_luggage else 1
    if has_luggage:
        excluded.add("okada")
    graph = build_graph(EDGES, excluded, min_reliability)
    result = dijkstra(graph, origin, destination, COST_FUNCTIONS[optimize_for])
    return result


if __name__ == "__main__":
    # Scenario 1: Galadimawa -> OSGOF, fastest (only path is via Apo Bridge)
    describe(run("Galadimawa Bridge", "OSGOF", "fastest"),
              "Galadimawa -> OSGOF, fastest")

    # Scenario 2: the direct-vs-transfer tradeoff you asked about
    describe(run("Galadimawa Bridge", "Mararaba", "fastest"),
              "Galadimawa -> Mararaba, FASTEST (should prefer the direct ride: 35 min < 45 min via Apo Bridge)")
    describe(run("Galadimawa Bridge", "Mararaba", "cheapest"),
              "Galadimawa -> Mararaba, CHEAPEST (should prefer via Apo Bridge: ₦600 < ₦700 direct)")
    describe(run("Galadimawa Bridge", "Mararaba", "fewest_transfers"),
              "Galadimawa -> Mararaba, FEWEST TRANSFERS (should prefer the direct ride: 1 leg < 2 legs)")

    # Scenario 3: "avoid motorcycles" to OSGOF -- only route there is by okada,
    # so this should safely report no route rather than inventing one.
    describe(run("Galadimawa Bridge", "OSGOF", "fastest", avoid_modes=["okada"]),
              "Galadimawa -> OSGOF, AVOID OKADA (should report no route -- safe failure, not a wrong answer)")

    # Scenario 4: luggage constraint (excludes okada + low-reliability edges)
    describe(run("Galadimawa Bridge", "OSGOF", "fastest", has_luggage=True),
              "Galadimawa -> OSGOF, HAS LUGGAGE (same as above -- okada is excluded)")
