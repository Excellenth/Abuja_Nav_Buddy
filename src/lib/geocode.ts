import { PLACES, type Place } from "@/data/abuja-places";

// Abuja/FCT viewbox (west, south, east, north)
const FCT_VIEWBOX = "6.9,9.4,7.75,8.6";

/**
 * Fuzzy match score for typeahead search — lower is better, null means no match.
 * Exact substrings rank best (by position); everything else falls back to an
 * in-order subsequence match (like a fuzzy file-finder) so small typos and
 * skipped letters ("mtama" -> "Maitama") still surface a suggestion.
 */
function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase().trim();
  const t = target.toLowerCase();
  if (!q) return 0;
  const idx = t.indexOf(q);
  if (idx !== -1) return idx;

  let qi = 0;
  let score = 0;
  let lastMatch = -1;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (lastMatch >= 0) score += ti - lastMatch - 1; // penalize gaps between matched letters
      lastMatch = ti;
      qi++;
    }
  }
  if (qi < q.length) return null; // not every query letter appeared in order
  return 1000 + score; // subsequence matches always rank behind substring matches
}

function fuzzySearchCurated(q: string, limit: number): Place[] {
  return PLACES.map((p) => ({ p, score: fuzzyScore(q, p.name) }))
    .filter((x): x is { p: Place; score: number } => x.score !== null)
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.p);
}

export async function searchPlaces(q: string): Promise<Place[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) {
    return trimmed ? fuzzySearchCurated(trimmed, 8) : PLACES.slice(0, 8);
  }
  const curated = fuzzySearchCurated(trimmed, 3);
  const remote = await geocode(trimmed);
  const seen = new Set<string>();
  const merged = [...curated, ...remote].filter((p) => {
    const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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
