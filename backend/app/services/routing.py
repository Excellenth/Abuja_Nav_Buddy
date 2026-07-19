"""
The routing algorithm itself: Dijkstra + pluggable cost functions over a
name-keyed graph. Deliberately plain Python, not pgRouting -- at pilot
scale (dozens to low-thousands of nodes) pulling the edge list into
memory once per request and running heapq-based Dijkstra is simpler to
deploy (no pgRouting extension headaches) and plenty fast. See
db/schema.sql and scripts/simulate_routing.py for the original design
note this is ported from.

RoutableEdge + list_for_routing live here, not in db/crud/edge.py, because
they're specific to this algorithm's input shape (node *names*, not ids --
see RoutableEdge's docstring) rather than a generic database operation
etl or anything else would need.
"""

import heapq
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, aliased

from db.models.edge import Edge
from db.models.node import Node

COST_FUNCTIONS = {
    "fastest": lambda e: e.time_min,
    "cheapest": lambda e: e.fare,
    "fewest_transfers": lambda e: 1,
}


@dataclass
class RoutableEdge:
    """Node *names*, not ids, because the algorithm was designed and
    tested (scripts/simulate_routing.py) against name-keyed graphs.

    `estimated` carries source_data == 'estimated' through to the routing
    result and on into TripStep -- a machine-guessed connection (see
    services/network.py) can legitimately look "fastest" purely because
    its distance-derived time estimate came out lower than a real,
    field-measured leg's actual time. That's fine for reachability, but
    the caller (plan_trip.py, then the API response) must be able to flag
    it rather than presenting an unverified shortcut as equally trustworthy
    as a field-verified one."""

    source: str
    target: str
    mode: str
    fare: float
    time_min: float
    reliability: int
    direction: str
    estimated: bool = False


def list_for_routing(db: Session) -> list[RoutableEdge]:
    src = aliased(Node)
    tgt = aliased(Node)
    stmt = (
        select(
            src.name.label("source_name"),
            tgt.name.label("target_name"),
            Edge.mode, Edge.fare_min, Edge.avg_time_min, Edge.reliability, Edge.direction, Edge.source_data,
        )
        .join(src, src.node_id == Edge.source)
        .join(tgt, tgt.node_id == Edge.target)
    )
    return [
        RoutableEdge(
            source=row.source_name,
            target=row.target_name,
            mode=row.mode,
            fare=float(row.fare_min) if row.fare_min is not None else 0.0,
            time_min=float(row.avg_time_min),
            reliability=row.reliability or 1,
            direction=row.direction,
            estimated=row.source_data == "estimated",
        )
        for row in db.execute(stmt)
    ]


@dataclass
class PathResult:
    cost: float
    path: list[RoutableEdge]


def build_graph(
    edges: list[RoutableEdge], excluded_modes: set[str], min_reliability: int = 1
) -> dict[str, list[RoutableEdge]]:
    graph: dict[str, list[RoutableEdge]] = {}
    for e in edges:
        if e.mode in excluded_modes or e.reliability < min_reliability:
            continue
        graph.setdefault(e.source, []).append(e)
        if e.direction == "bidirectional":
            graph.setdefault(e.target, []).append(
                RoutableEdge(e.target, e.source, e.mode, e.fare, e.time_min, e.reliability, e.direction, e.estimated)
            )
    return graph


def dijkstra(graph: dict[str, list[RoutableEdge]], start: str, goal: str, cost_of) -> PathResult | None:
    # The third tuple element is a tiebreaker counter, not the path itself --
    # heapq falls back to comparing tuple elements on a cost tie, and
    # RoutableEdge/list aren't orderable, so pushing the path directly
    # would raise TypeError the first time two candidates tie on cost.
    counter = 0
    queue: list[tuple[float, int, str, list[RoutableEdge]]] = [(0.0, counter, start, [])]
    best = {start: 0.0}
    while queue:
        cost, _, node, path = heapq.heappop(queue)
        if node == goal:
            return PathResult(cost=cost, path=path)
        if cost > best.get(node, float("inf")):
            continue
        for edge in graph.get(node, []):
            new_cost = cost + cost_of(edge)
            if new_cost < best.get(edge.target, float("inf")):
                best[edge.target] = new_cost
                counter += 1
                heapq.heappush(queue, (new_cost, counter, edge.target, path + [edge]))
    return None


def route(
    edges: list[RoutableEdge],
    origin: str,
    destination: str,
    optimize_for: str = "fastest",
    avoid_modes: list[str] | None = None,
    has_luggage: bool = False,
    direct_only: bool = False,
) -> PathResult | None:
    excluded = set(avoid_modes or [])
    min_reliability = 3 if has_luggage else 1
    if has_luggage:
        excluded.add("okada")
    graph = build_graph(edges, excluded, min_reliability)

    if direct_only:
        # A direct-only request means exactly that: one edge, no transfer.
        # Plain Dijkstra with a fewest-transfers cost could still return a
        # 2+ hop path if no direct edge exists, so this is checked
        # separately rather than trusting the general solver to say "no".
        for edge in graph.get(origin, []):
            if edge.target == destination:
                cost = edge.time_min if optimize_for == "fastest" else edge.fare
                return PathResult(cost=cost, path=[edge])
        return None

    return dijkstra(graph, origin, destination, COST_FUNCTIONS[optimize_for])
