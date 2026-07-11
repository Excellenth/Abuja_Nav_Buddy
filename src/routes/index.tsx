import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { type Place } from "@/data/abuja-places";
import { planTrip, type Directions } from "@/lib/plan-trip";
import { AbujaMap } from "@/components/AbujaMap";
import { PlacePicker, reverseGeocode } from "@/components/PlacePicker";
import {
  addBookmark,
  addToHistory,
  getBookmarks,
  getHistory,
  isBookmarked,
  removeBookmark,
  removeHistory,
  type SavedTrip,
} from "@/lib/trip-storage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NaijaNav Abuja — Directions & transport fares" },
      {
        name: "description",
        content:
          "Search a place, use your current location or pick on the map to get step-by-step directions and public transport fares in Abuja.",
      },
      { property: "og:title", content: "NaijaNav Abuja — Directions & transport fares" },
      {
        property: "og:description",
        content: "Simple public transport directions for newcomers to Abuja, FCT.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: Home,
});

type PickTarget = "from" | "to" | null;

function Home() {
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [directions, setDirections] = useState<Directions | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickTarget, setPickTarget] = useState<PickTarget>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [history, setHistory] = useState<SavedTrip[]>([]);
  const [bookmarks, setBookmarks] = useState<SavedTrip[]>([]);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    setMounted(true);
    setHistory(getHistory());
    setBookmarks(getBookmarks());
  }, []);

  useEffect(() => {
    if (from && to) setBookmarked(isBookmarked(from.id, to.id));
    else setBookmarked(false);
  }, [from?.id, to?.id, bookmarks]);

  async function onGo() {
    if (!from || !to || from.id === to.id) return;
    setLoading(true);
    try {
      const d = await planTrip(from, to);
      setDirections(d);
      const updated = addToHistory({
        from,
        to,
        totalKm: d.totalKm,
        totalPriceNgn: d.totalPriceNgn,
      });
      setHistory(updated);
    } finally {
      setLoading(false);
    }
  }

  function swap() {
    setFrom(to);
    setTo(from);
    setDirections(null);
  }

  function loadTrip(t: SavedTrip) {
    setFrom(t.from);
    setTo(t.to);
    setDirections(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleBookmark() {
    if (!from || !to || !directions) return;
    if (isBookmarked(from.id, to.id)) {
      removeBookmark(from.id, to.id);
    } else {
      addBookmark({
        from,
        to,
        totalKm: directions.totalKm,
        totalPriceNgn: directions.totalPriceNgn,
      });
    }
    setBookmarks(getBookmarks());
  }

  function deleteHistoryItem(id: string) {
    removeHistory(id);
    setHistory(getHistory());
  }
  function deleteBookmark(t: SavedTrip) {
    removeBookmark(t.from.id, t.to.id);
    setBookmarks(getBookmarks());
  }

  async function handleMapPick(lat: number, lng: number) {
    if (!pickTarget || pickBusy) return;
    setPickBusy(true);
    const place = await reverseGeocode(lat, lng);
    if (pickTarget === "from") setFrom(place);
    else setTo(place);
    setPickTarget(null);
    setPickBusy(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:px-4 sm:py-4">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-primary-foreground"
            style={{ background: "var(--gradient-hero)" }}
            aria-hidden
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
          </span>
          <h1 className="min-w-0 truncate font-display text-base font-extrabold tracking-tight sm:text-lg">
            NaijaNav <span className="text-primary">Abuja</span>
          </h1>
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">
            FCT
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-10">
        <section className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)] sm:p-6">
          <div className="grid gap-4">
            <PlacePicker
              label="From"
              value={from}
              onChange={(p) => {
                setFrom(p);
                setDirections(null);
              }}
              dotColor="var(--primary)"
              onRequestMapPick={() => setPickTarget("from")}
            />
            <div className="flex justify-center">
              <button
                onClick={swap}
                disabled={!from && !to}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-40"
                aria-label="Swap start and stop"
              >
                ↑↓ Swap
              </button>
            </div>
            <PlacePicker
              label="Stop"
              value={to}
              onChange={(p) => {
                setTo(p);
                setDirections(null);
              }}
              dotColor="#b23a48"
              onRequestMapPick={() => setPickTarget("to")}
            />
            <button
              onClick={onGo}
              disabled={!from || !to || from?.id === to?.id || loading}
              className="mt-1 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {loading ? "Planning route…" : "Get directions"}
            </button>
          </div>
        </section>

        {directions && from && to && (
          <section className="mt-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="min-w-0 truncate font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Trip plan
              </h2>
              <button
                onClick={toggleBookmark}
                className={
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
                  (bookmarked
                    ? "border-primary bg-accent text-primary"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground")
                }
                aria-pressed={bookmarked}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
                </svg>
                {bookmarked ? "Bookmarked" : "Bookmark"}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Distance" value={`${directions.totalKm.toFixed(1)} km`} />
              <Metric label="Time" value={`~${directions.estMinutes} min`} />
              <Metric
                label="Fare"
                value={`₦${directions.totalPriceNgn.toLocaleString()}`}
                emphasis
              />
            </div>

            <div className="h-56 overflow-hidden rounded-2xl border border-border bg-muted sm:h-72">
              {mounted && (
                <AbujaMap from={from} to={to} routeCoords={directions.routeCoords} />
              )}
            </div>

            <ol className="space-y-2">
              {directions.steps.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4"
                >
                  <div className="flex flex-col items-center">
                    <div
                      className="grid h-9 w-9 place-items-center rounded-full text-primary-foreground"
                      style={{ background: "var(--gradient-hero)" }}
                    >
                      <ModeIcon mode={s.mode} />
                    </div>
                    {i < directions.steps.length - 1 && (
                      <div className="mt-1 h-6 w-px bg-border" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="min-w-0 flex-1 text-sm font-semibold leading-snug sm:text-base">
                        {s.label}
                      </p>
                      <span className="shrink-0 text-sm font-semibold text-primary">
                        {s.priceNgn > 0 ? `₦${s.priceNgn.toLocaleString()}` : "Free"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{s.detail}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.km.toFixed(1)} km · {modeLabel(s.mode)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="text-xs text-muted-foreground">
              Fares are estimates. Always confirm with the driver before boarding.
            </p>
          </section>
        )}

        {!directions && (
          <div className="mt-6 space-y-6">
            {bookmarks.length === 0 && history.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                Type a location, use your current location, or pick on the map to get started.
              </p>
            )}

            {bookmarks.length > 0 && (
              <TripList
                title="Bookmarks"
                icon="star"
                items={bookmarks}
                onOpen={loadTrip}
                onRemove={deleteBookmark}
              />
            )}

            {history.length > 0 && (
              <TripList
                title="Recent trips"
                icon="clock"
                items={history}
                onOpen={loadTrip}
                onRemove={(t) => deleteHistoryItem(t.id)}
              />
            )}
          </div>
        )}
      </main>

      <footer className="mx-auto max-w-3xl px-4 py-8 text-center text-xs text-muted-foreground">
        Map data © OpenStreetMap · Search © Nominatim · Routing © OSRM
      </footer>

      {/* Map picker modal */}
      {pickTarget && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background h-dvh-safe"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <button
              onClick={() => setPickTarget(null)}
              className="rounded-full px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              ← Cancel
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pick {pickTarget === "from" ? "start" : "stop"}
              </div>
              <div className="truncate text-sm font-semibold">
                {pickBusy ? "Getting address…" : "Tap anywhere on the map"}
              </div>
            </div>
            <div className="w-[68px]" />
          </div>
          <div className="relative flex-1">
            {mounted && (
              <AbujaMap
                from={pickTarget === "from" ? null : from}
                to={pickTarget === "to" ? null : to}
                pickMode
                onPick={handleMapPick}
              />
            )}
            <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl border border-border bg-card/95 px-4 py-2 text-center text-xs text-muted-foreground shadow-lg backdrop-blur">
              Tip: pinch to zoom, drag to pan, tap a spot to select it.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div
      className={
        "min-w-0 rounded-2xl border p-2 text-center sm:p-3 " +
        (emphasis ? "border-primary bg-accent" : "border-border bg-card")
      }
    >
      <div className="truncate text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={"mt-0.5 truncate font-display text-base font-extrabold sm:text-lg " + (emphasis ? "text-primary" : "")}>
        {value}
      </div>
    </div>
  );
}

function modeLabel(m: string) {
  return (
    {
      walk: "Walking",
      keke: "Keke NAPEP",
      taxi: "Shared taxi",
      bus: "Government bus",
      metro: "Metro rail",
    } as Record<string, string>
  )[m] ?? m;
}

function ModeIcon({ mode }: { mode: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (mode === "walk")
    return (
      <svg {...common}>
        <circle cx="13" cy="4" r="1.6" />
        <path d="M10 21l2-7-3-3 2-5 3 2 3 1" />
      </svg>
    );
  if (mode === "bus")
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="12" rx="2" />
        <path d="M4 13h16M8 17v2M16 17v2" />
      </svg>
    );
  if (mode === "metro")
    return (
      <svg {...common}>
        <rect x="5" y="3" width="14" height="16" rx="3" />
        <path d="M5 14h14M9 22l3-3 3 3" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M4 17V11l3-5h10l3 5v6" />
      <circle cx="8" cy="18" r="1.8" />
      <circle cx="16" cy="18" r="1.8" />
    </svg>
  );
}
