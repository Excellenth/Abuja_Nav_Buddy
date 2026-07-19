import type { Place } from "@/data/abuja-places";
import { searchKnownStops } from "@/lib/backend-api";

// Abuja/FCT viewbox (west, south, east, north)
const FCT_VIEWBOX = "6.9,9.4,7.75,8.6";

function knownStopToPlace(s: Awaited<ReturnType<typeof searchKnownStops>>[number]): Place {
  return {
    id: `stop-${s.node_id}`,
    name: s.name,
    category: "Bus stop",
    lat: s.lat,
    lng: s.lng,
    description: s.landmark_description ?? undefined,
    nodeId: s.node_id,
  };
}

/**
 * Known, already-mapped stops (your own field data/OSM-contributed points)
 * first, then live Nominatim results -- Nominatim has never heard of an
 * informal stop name like "Galadimawa Bridge", so without this a commuter
 * could never find it by typing its name.
 */
export async function searchPlaces(q: string): Promise<Place[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  const [known, remote] = await Promise.all([searchKnownStops(trimmed), geocode(trimmed)]);
  const knownPlaces = known.map(knownStopToPlace);
  const seen = new Set(knownPlaces.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`));
  const merged = [...knownPlaces, ...remote.filter((p) => !seen.has(`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`))];
  return merged.slice(0, 8);
}

async function fetchNominatim(q: string, bounded: boolean): Promise<Place[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=ng&dedupe=1` +
    `&viewbox=${FCT_VIEWBOX}${bounded ? "&bounded=1" : ""}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return [];
  const json = (await res.json()) as Array<{
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    type?: string;
    class?: string;
  }>;
  return json.map((r) => ({
    id: `osm-${r.place_id}`,
    name: r.display_name.split(",").slice(0, 2).join(",").trim(),
    category: (r.type || r.class || "Place").replace(/_/g, " "),
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    description: r.display_name,
  }));
}

async function geocode(q: string): Promise<Place[]> {
  const bounded = await fetchNominatim(q, true);
  if (bounded.length > 0) return bounded;
  // Nothing inside the strict Abuja viewbox — broaden the search (still Nigeria-biased
  // toward Abuja via the viewbox ranking hint) so near-misses and fuzzy spellings still surface.
  return fetchNominatim(q, false);
}

export async function reverseGeocode(lat: number, lng: number): Promise<Place> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const j = await res.json();
      const shortName =
        j.name ||
        (j.display_name as string | undefined)?.split(",")[0]?.trim() ||
        "Selected location";
      return {
        id: `rev-${lat.toFixed(5)}-${lng.toFixed(5)}`,
        name: shortName,
        category: "Selected",
        lat,
        lng,
        description: j.display_name,
      };
    }
  } catch {}
  return {
    id: `rev-${lat.toFixed(5)}-${lng.toFixed(5)}`,
    name: `Pin ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    category: "Selected",
    lat,
    lng,
  };
}

/** Best-effort single-result lookup for AI-suggested stop queries. Returns null if nothing matched. */
export async function geocodeOne(query: string): Promise<Place | null> {
  const results = await searchPlaces(query);
  return results[0] ?? null;
}
