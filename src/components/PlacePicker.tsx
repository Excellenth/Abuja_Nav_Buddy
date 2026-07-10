import { useEffect, useRef, useState } from "react";
import { PLACES, type Place } from "@/data/abuja-places";

type Props = {
  label: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
  dotColor: string;
  onRequestMapPick: () => void;
};

// Abuja/FCT viewbox (west, south, east, north)
const FCT_VIEWBOX = "6.9,9.4,7.75,8.6";

async function geocode(q: string): Promise<Place[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=6&countrycodes=ng` +
    `&viewbox=${FCT_VIEWBOX}&bounded=1&q=${encodeURIComponent(q)}`;
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

export async function reverseGeocode(lat: number, lng: number): Promise<Place> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const j = await res.json();
      const name =
        j.name ||
        (j.display_name as string | undefined)?.split(",").slice(0, 2).join(",").trim() ||
        "Selected location";
      return {
        id: `rev-${lat.toFixed(5)}-${lng.toFixed(5)}`,
        name,
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

export function PlacePicker({ label, value, onChange, dotColor, onRequestMapPick }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      // Show curated suggestions as fallback
      setSuggestions(
        PLACES.filter((p) => (q ? p.name.toLowerCase().includes(q.toLowerCase()) : true)).slice(0, 8),
      );
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      const curated = PLACES.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).slice(0, 3);
      const remote = await geocode(q);
      const seen = new Set<string>();
      const merged = [...curated, ...remote].filter((p) => {
        const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setSuggestions(merged.slice(0, 8));
      setLoading(false);
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  function pick(p: Place) {
    onChange(p);
    setQuery("");
    setOpen(false);
    setError(null);
  }

  function useCurrent() {
    if (!("geolocation" in navigator)) {
      setError("Location not supported on this device.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const p = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        pick({ ...p, name: p.name === "Selected location" ? "My current location" : p.name });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied."
            : "Couldn't get your location.",
        );
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: dotColor }} />
        {label}
      </div>

      {value ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 shadow-sm">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{value.name}</div>
            {value.description && value.description !== value.name && (
              <div className="truncate text-xs text-muted-foreground">{value.description}</div>
            )}
          </div>
          <button
            onClick={() => {
              onChange(null);
              setQuery("");
              setTimeout(() => setOpen(true), 0);
            }}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
            aria-label={`Clear ${label}`}
          >
            Change
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            inputMode="search"
            autoComplete="off"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search a place in Abuja…"
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
          />

          <div className="mt-2 flex flex-col gap-2 xs:flex-row sm:flex-row">
            <button
              type="button"
              onClick={useCurrent}
              disabled={locating}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold shadow-sm transition hover:border-primary/40 disabled:opacity-60"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
              </svg>
              {locating ? "Locating…" : "Use current location"}
            </button>
            <button
              type="button"
              onClick={onRequestMapPick}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold shadow-sm transition hover:border-primary/40"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" />
                <circle cx="12" cy="9" r="2.5" />
              </svg>
              Pick on map
            </button>
          </div>

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

          {open && (
            <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-lg">
              {loading && (
                <div className="px-4 py-3 text-xs text-muted-foreground">Searching…</div>
              )}
              {!loading && suggestions.length === 0 && (
                <div className="px-4 py-3 text-xs text-muted-foreground">
                  No matches. Try a different name.
                </div>
              )}
              <ul className="max-h-72 overflow-y-auto">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pick(s)}
                      className="flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-accent"
                    >
                      <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-accent text-[10px] font-bold text-primary">
                        {s.category?.[0]?.toUpperCase() ?? "•"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{s.name}</span>
                        {s.description && s.description !== s.name && (
                          <span className="block truncate text-xs text-muted-foreground">
                            {s.description}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
