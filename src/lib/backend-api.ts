// Client for the real backend/ FastAPI server -- see ../../../backend/README.md.
// Every trip-planning number (fare, time, route) shown in the UI comes from
// here, not from a client-side guess. VITE_BACKEND_URL points at it in
// production; localhost:8000 is the default local dev backend.

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) || "http://localhost:8000";

export class BackendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "BackendError";
    this.status = status;
  }
}

// ---------- Types (mirror backend/app/schemas/*.py) ----------

export type NodeType = "loading_point" | "junction" | "transfer_point" | "bridge";

export type NodeCandidate = {
  node_id: number;
  name: string;
  node_type: NodeType;
  landmark_description: string | null;
  distance_m: number;
  lat: number;
  lng: number;
};

export type ResolveResponse = {
  display_name: string;
  candidates: NodeCandidate[];
};

export type NodeSearchResult = {
  node_id: number;
  name: string;
  node_type: NodeType;
  landmark_description: string | null;
  lat: number;
  lng: number;
};

export type TransportMode = "okada" | "keke_napep" | "minibus" | "shared_taxi";
export type OptimizeFor = "fastest" | "cheapest" | "fewest_transfers";

export type TripStep = {
  type: "walk" | "ride";
  mode: TransportMode | null;
  from_name: string;
  to_name: string;
  from_landmark: string | null;
  to_landmark: string | null;
  from_lat: number | null;
  from_lng: number | null;
  to_lat: number | null;
  to_lng: number | null;
  distance_m: number | null;
  fare_ngn: number | null;
  time_min: number | null;
  estimated: boolean;
};

export type TripResponse = {
  found: boolean;
  message: string | null;
  steps: TripStep[];
  total_fare_ngn: number | null;
  total_time_min: number | null;
  leg_count: number | null;
  includes_estimated_legs: boolean;
};

export type TripOptions = {
  optimize_for?: OptimizeFor;
  avoid_modes?: TransportMode[];
  has_luggage?: boolean;
  direct_only?: boolean;
};

// ---------- Cache ----------
// Repeated lookups (re-resolving the same stop name, re-planning the same
// leg while a multi-stop itinerary is being edited) shouldn't re-hit the
// network every time. In-memory only -- a page reload starts fresh, same
// as any other in-flight app state.

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expires: number; data: unknown }>();

function cacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.data as T;
}

function cacheSet(key: string, data: unknown) {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

async function backendFetch<T>(path: string, init: RequestInit, cacheKey: string | null): Promise<T> {
  if (cacheKey) {
    const hit = cacheGet<T>(cacheKey);
    if (hit) return hit;
  }
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = (body?.detail as string | undefined) || `Backend request to ${path} failed (${res.status})`;
    throw new BackendError(message, res.status);
  }
  const data = (await res.json()) as T;
  if (cacheKey) cacheSet(cacheKey, data);
  return data;
}

// ---------- Endpoints ----------

export async function searchKnownStops(query: string, limit = 5): Promise<NodeSearchResult[]> {
  const key = `node-search:${query.trim().toLowerCase()},${limit}`;
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  try {
    return await backendFetch<NodeSearchResult[]>(`/nodes/search?${params}`, { method: "GET" }, key);
  } catch {
    return []; // backend unreachable -- typeahead falls back to the live geocoder alone
  }
}

export async function resolveStop(text: string): Promise<ResolveResponse> {
  const key = `resolve:${text.trim().toLowerCase()}`;
  return backendFetch<ResolveResponse>("/resolve", { method: "POST", body: JSON.stringify({ text }) }, key);
}

export async function nearbyStops(lat: number, lng: number, limit = 2): Promise<NodeCandidate[]> {
  const key = `nearby:${lat.toFixed(5)},${lng.toFixed(5)},${limit}`;
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng), limit: String(limit) });
  return backendFetch<NodeCandidate[]>(`/nodes/nearby?${params}`, { method: "GET" }, key);
}

export async function planTripFromNodes(
  originNodeId: number,
  destinationNodeId: number,
  opts: TripOptions = {},
): Promise<TripResponse> {
  const body = { origin_node_id: originNodeId, destination_node_id: destinationNodeId, ...opts };
  const key = `trip-nodes:${JSON.stringify(body)}`;
  return backendFetch<TripResponse>("/trip/from-nodes", { method: "POST", body: JSON.stringify(body) }, key);
}

export async function planTripFromText(
  originText: string,
  destinationText: string,
  opts: TripOptions = {},
): Promise<TripResponse> {
  const body = { origin_text: originText, destination_text: destinationText, ...opts };
  const key = `trip-text:${JSON.stringify(body)}`;
  return backendFetch<TripResponse>("/trip", { method: "POST", body: JSON.stringify(body) }, key);
}
