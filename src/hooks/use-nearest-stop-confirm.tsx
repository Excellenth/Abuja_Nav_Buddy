import { useState } from "react";
import type { Place } from "@/data/abuja-places";
import { nearbyStops, type NodeCandidate } from "@/lib/backend-api";

// Beyond this, "nearest known stop" is technically true but practically
// useless to offer -- mirrors the spirit of the backend's own
// MAX_REASONABLE_WALK_METERS (app/services/geocode.py), a bit looser here
// since the Frontend only *offers* a candidate, it doesn't reject.
const MAX_OFFER_METERS = 1200;

type ConfirmState = {
  raw: Place;
  candidates: NodeCandidate[];
  resolve: (place: Place) => void;
};

function candidateToPlace(c: NodeCandidate): Place {
  return {
    id: `stop-${c.node_id}`,
    name: c.name,
    category: "Bus stop",
    lat: c.lat,
    lng: c.lng,
    description: c.landmark_description ?? undefined,
    nodeId: c.node_id,
  };
}

/**
 * After a raw location is resolved (search pick, GPS, map tap), offers the
 * nearest known bus stops so the commuter can confirm one instead of
 * silently trusting a raw coordinate -- see PROJECT_DECISIONS.md's
 * "nearest-stops picker" flow (GET /nodes/nearby). Renders `dialog` once
 * per page; `confirm(raw)` resolves to either the chosen stop (with
 * `nodeId` set, so trip planning routes over the real graph) or the raw
 * place unchanged if the commuter dismisses it or none are close enough.
 */
export function useNearestStopConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);

  async function confirm(raw: Place): Promise<Place> {
    let candidates: NodeCandidate[] = [];
    try {
      candidates = await nearbyStops(raw.lat, raw.lng, 2);
    } catch {
      return raw; // backend unreachable -- fail safe, keep the raw location rather than block
    }
    const walkable = candidates.filter((c) => c.distance_m <= MAX_OFFER_METERS);
    if (walkable.length === 0) return raw;
    // Already exactly a known stop (e.g. picked from search results that came
    // from the destinations cache) -- nothing to confirm.
    if (walkable[0].distance_m === 0 && raw.nodeId === walkable[0].node_id) return raw;

    return new Promise<Place>((resolve) => {
      setState({ raw, candidates: walkable, resolve });
    });
  }

  function choose(candidate: NodeCandidate | null) {
    if (!state) return;
    state.resolve(candidate ? candidateToPlace(candidate) : state.raw);
    setState(null);
  }

  const dialog = state ? (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-2xl border border-border bg-card p-4 shadow-lg sm:rounded-2xl">
        <h3 className="text-sm font-bold">Is one of these your stop?</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          These are the closest known bus stops to <b>{state.raw.name}</b>. Pick the one you recognize, or keep your
          exact location.
        </p>
        <ul className="mt-3 space-y-2">
          {state.candidates.map((c) => (
            <li key={c.node_id}>
              <button
                type="button"
                onClick={() => choose(c)}
                className="flex w-full items-start justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-left transition hover:border-primary/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  {c.landmark_description && (
                    <span className="block truncate text-xs text-muted-foreground">{c.landmark_description}</span>
                  )}
                </span>
                <span className="shrink-0 text-xs font-medium text-primary">{Math.round(c.distance_m)}m</span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => choose(null)}
          className="mt-3 w-full rounded-xl border border-dashed border-border bg-background px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
        >
          None of these — use exact location
        </button>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
