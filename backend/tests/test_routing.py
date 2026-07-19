"""
Tests for the DB-independent parts of the backend: the Dijkstra routing
algorithm and the network-leveling distance/mode estimator. Neither needs
a live database -- run these any time with:
  cd backend && .venv\\Scripts\\pytest tests/ -v
"""

from app.services.network import ROAD_INDIRECTION_FACTOR, estimate_connection
from app.services.routing import RoutableEdge, build_graph, dijkstra, route

# Same trio-plus-direct-edge test graph as the original
# scripts/simulate_routing.py, kept here as a regression check on the
# ported algorithm.
TEST_EDGES = [
    RoutableEdge("Galadimawa Bridge", "Apo Bridge", "shared_taxi", fare=300, time_min=20, reliability=4, direction="one_way"),
    RoutableEdge("Apo Bridge", "OSGOF", "okada", fare=600, time_min=11, reliability=4, direction="one_way"),
    RoutableEdge("Apo Bridge", "Mararaba", "shared_taxi", fare=300, time_min=25, reliability=4, direction="one_way"),
    # Direct service: passenger never alights at Apo Bridge, so this is its
    # own edge, not a combination of the two edges above.
    RoutableEdge("Galadimawa Bridge", "Mararaba", "shared_taxi", fare=700, time_min=35, reliability=3, direction="one_way"),
]


def test_fastest_route_via_transfer():
    result = route(TEST_EDGES, "Galadimawa Bridge", "OSGOF", "fastest")
    assert result is not None
    assert [e.target for e in result.path] == ["Apo Bridge", "OSGOF"]
    assert result.cost == 31  # 20 + 11


def test_fastest_prefers_direct_over_transfer():
    result = route(TEST_EDGES, "Galadimawa Bridge", "Mararaba", "fastest")
    assert result is not None
    assert len(result.path) == 1  # direct 35 min beats 20+25=45 min via Apo Bridge
    assert result.path[0].time_min == 35


def test_cheapest_prefers_transfer_over_direct():
    result = route(TEST_EDGES, "Galadimawa Bridge", "Mararaba", "cheapest")
    assert result is not None
    assert len(result.path) == 2  # 300+300=600 via Apo Bridge beats 700 direct
    assert sum(e.fare for e in result.path) == 600


def test_fewest_transfers_prefers_direct():
    result = route(TEST_EDGES, "Galadimawa Bridge", "Mararaba", "fewest_transfers")
    assert result is not None
    assert len(result.path) == 1


def test_avoid_mode_reports_no_route_rather_than_a_wrong_one():
    # OSGOF is only reachable by okada in the test graph -- avoiding okada
    # must report "no route", never silently invent a different one.
    result = route(TEST_EDGES, "Galadimawa Bridge", "OSGOF", "fastest", avoid_modes=["okada"])
    assert result is None


def test_luggage_excludes_okada():
    result = route(TEST_EDGES, "Galadimawa Bridge", "OSGOF", "fastest", has_luggage=True)
    assert result is None  # same reasoning as above -- okada is the only path


def test_direct_only_rejects_multi_hop_even_if_reachable():
    # A direct edge exists Galadimawa -> Mararaba, so direct_only should
    # succeed here...
    result = route(TEST_EDGES, "Galadimawa Bridge", "Mararaba", "fastest", direct_only=True)
    assert result is not None
    assert len(result.path) == 1

    # ...but Galadimawa -> OSGOF has no direct edge (only via Apo Bridge),
    # so direct_only must say "no route", not fall back to the 2-hop path.
    result = route(TEST_EDGES, "Galadimawa Bridge", "OSGOF", "fastest", direct_only=True)
    assert result is None


def test_unreachable_node_returns_none():
    result = route(TEST_EDGES, "Galadimawa Bridge", "Nowhere", "fastest")
    assert result is None


def test_dijkstra_tie_break_does_not_raise():
    # Two zero-cost edges into the same node on a "fewest_transfers"-style
    # cost tie used to raise TypeError (heapq falling back to comparing
    # unorderable path lists) before the tiebreaker counter was added.
    edges = [
        RoutableEdge("A", "B", "walk", fare=0, time_min=0, reliability=5, direction="one_way"),
        RoutableEdge("A", "C", "walk", fare=0, time_min=0, reliability=5, direction="one_way"),
        RoutableEdge("B", "D", "walk", fare=0, time_min=0, reliability=5, direction="one_way"),
        RoutableEdge("C", "D", "walk", fare=0, time_min=0, reliability=5, direction="one_way"),
    ]
    graph = build_graph(edges, excluded_modes=set())
    result = dijkstra(graph, "A", "D", lambda e: e.time_min)
    assert result is not None
    assert result.cost == 0


def test_estimate_connection_mode_bands():
    mode, time_min = estimate_connection(300)  # short hop -> walk
    assert mode == "walk"
    assert time_min == 300 * ROAD_INDIRECTION_FACTOR / 75

    mode, _ = estimate_connection(2_000)
    assert mode == "keke_napep"

    mode, _ = estimate_connection(6_000)
    assert mode == "shared_taxi"

    mode, _ = estimate_connection(20_000)
    assert mode == "minibus"


def test_estimate_connection_never_returns_zero_time():
    # A near-zero distance shouldn't produce a near-zero (or zero) time
    # estimate -- max(1.0, ...) floors it at one minute.
    _, time_min = estimate_connection(0.01)
    assert time_min >= 1.0
