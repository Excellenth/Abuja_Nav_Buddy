import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { type Place } from "@/data/abuja-places";
import { planMultiTrip, type Directions } from "@/lib/plan-trip";
import { AbujaMap } from "@/components/AbujaMap";
import { PlacePicker } from "@/components/PlacePicker";
import { TripSteps } from "@/components/TripResult";
import { reverseGeocode } from "@/lib/geocode";
import { addPlan, consumePendingStops, getDraft, setDraft, updatePlan } from "@/lib/trip-storage";

const NAVIGATOR_DRAFT_KEY = "naijanav.navigatorDraft.v1";
type NavigatorDraft = {
  stops: (Place | null)[];
  directions: Directions | null;
  activePlanId: string | null;
  rating: number;
  comment: string;
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Abuja NavBuddy — Directions, fares & outings" },
      {
        name: "description",
        content:
          "Plan multi-stop trips across Abuja with step-by-step directions and public transport fares. Bookmarks and outing planning.",
      },
      { property: "og:title", content: "Abuja NavBuddy — Directions, fares & outings" },
      {
        property: "og:description",
        content: "Multi-stop Abuja trip planner with fare estimates.",
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

type PickTarget = { index: number } | null;

function stopLabel(i: number, total: number) {
  if (i === 0) return "Start";
  if (i === total - 1) return "Stop";
  return `Via ${i}`;
}
function stopColor(i: number, total: number) {
  if (i === 0) return "var(--primary)";
  if (i === total - 1) return "#b23a48";
  return "#c88a04";
}

function Home() {
  const [stops, setStops] = useState<(Place | null)[]>([null, null]);
  const [directions, setDirections] = useState<Directions | null>(null);
  const [loading, setLoading] = useState(false);
  const [pickTarget, setPickTarget] = useState<PickTarget>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  // For the current active plan (saved)
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setMounted(true);
    const pending = consumePendingStops();
    if (pending && pending.length >= 2) {
      setStops(pending);
      setDirections(null);
      setActivePlanId(null);
    } else {
      const draft = getDraft<NavigatorDraft>(NAVIGATOR_DRAFT_KEY);
      if (draft) {
        setStops(draft.stops);
        setDirections(draft.directions);
        setActivePlanId(draft.activePlanId);
        setRating(draft.rating);
        setComment(draft.comment);
      }
    }
    setHydrated(true);
  }, []);

  // Keep in-progress state (stops, directions, rating) across tab switches within this session
  useEffect(() => {
    if (!hydrated) return;
    setDraft<NavigatorDraft>(NAVIGATOR_DRAFT_KEY, { stops, directions, activePlanId, rating, comment });
  }, [hydrated, stops, directions, activePlanId, rating, comment]);

  const filledStops = useMemo(() => stops.filter((s): s is Place => !!s), [stops]);
  const canGo = filledStops.length >= 2 && filledStops.length === stops.length;

  function setStopAt(i: number, p: Place | null) {
    setStops((prev) => {
      const next = [...prev];
      next[i] = p;
      return next;
    });
    setDirections(null);
    setActivePlanId(null);
  }
  function addStop() {
    setStops((prev) => {
      if (prev.length >= 6) return prev;
      const next = [...prev];
      next.splice(next.length - 1, 0, null); // insert before final Stop
      return next;
    });
    setDirections(null);
  }
  function removeStopAt(i: number) {
    setStops((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));
    setDirections(null);
  }
  function swap() {
    setStops((prev) => [...prev].reverse());
    setDirections(null);
  }

  async function onGo() {
    if (!canGo) return;
    setLoading(true);
    setRating(0);
    setComment("");
    setActivePlanId(null);
    try {
      const d = await planMultiTrip(filledStops);
      setDirections(d);
    } finally {
      setLoading(false);
    }
  }

  function savePlan() {
    if (!directions || filledStops.length < 2) return;
    const name =
      window.prompt(
        "Name this outing",
        filledStops.length > 2
          ? `${filledStops[0].name} → ${filledStops[filledStops.length - 1].name} (+${filledStops.length - 2} stops)`
          : `${filledStops[0].name} → ${filledStops[1].name}`,
      )?.trim();
    if (!name) return;
    const updated = addPlan({
      name,
      stops: filledStops,
      totalKm: directions.totalKm,
      totalPriceNgn: directions.totalPriceNgn,
      estMinutes: directions.estMinutes,
      rating: rating || undefined,
      comment: comment.trim() || undefined,
    });
    setActivePlanId(updated[0].id);
  }

  function persistRating(next: number) {
    setRating(next);
    if (activePlanId) {
      updatePlan(activePlanId, { rating: next });
    }
  }
  function persistComment(next: string) {
    setComment(next);
    if (activePlanId) {
      updatePlan(activePlanId, { comment: next.trim() || undefined });
    }
  }

  async function handleMapPick(lat: number, lng: number) {
    if (!pickTarget || pickBusy) return;
    setPickBusy(true);
    const place = await reverseGeocode(lat, lng);
    setStopAt(pickTarget.index, place);
    setPickTarget(null);
    setPickBusy(false);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-3 sm:px-4 sm:py-4">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"
            aria-hidden
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" />
            </svg>
          </span>
          <h1 className="min-w-0 truncate font-display text-base font-extrabold tracking-tight sm:text-lg">
            Abuja <span className="text-primary">NavBuddy</span>
          </h1>
          <Link
            to="/saved-outings"
            aria-label="Saved outings & history"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-accent hover:text-primary"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-10">
        <section className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)] sm:p-6">
          <div className="grid gap-4">
            {stops.map((s, i) => (
              <div key={i} className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {stopLabel(i, stops.length)}
                  </span>
                  {i > 0 && i < stops.length - 1 && (
                    <button
                      type="button"
                      onClick={() => removeStopAt(i)}
                      className="text-xs font-medium text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <PlacePicker
                  label=""
                  value={s}
                  onChange={(p) => setStopAt(i, p)}
                  dotColor={stopColor(i, stops.length)}
                  onRequestMapPick={() => setPickTarget({ index: i })}
                  voiceEnabled={false}
                />
              </div>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={addStop}
                disabled={stops.length >= 6}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-40"
              >
                + Add stop
              </button>
              <button
                onClick={swap}
                disabled={filledStops.length < 2}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-40"
                aria-label="Reverse route"
              >
                ↑↓ Reverse
              </button>
            </div>

            <button
              onClick={onGo}
              disabled={!canGo || loading}
              className="mt-1 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {loading ? "Planning route…" : "Get directions"}
            </button>
          </div>
        </section>

        {directions && canGo && (
          <section className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="min-w-0 truncate font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Trip plan
              </h2>
              <button
                onClick={savePlan}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary bg-card px-3 py-1.5 text-xs font-semibold text-primary transition hover:bg-accent/40"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
                </svg>
                {activePlanId ? "Saved" : "Save outing"}
              </button>
            </div>

            <TripSteps
              directions={directions}
              from={filledStops[0]}
              to={filledStops[filledStops.length - 1]}
              mounted={mounted}
            />

            <div className="rounded-2xl border border-border bg-card p-3 sm:p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Rate this plan
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your rating helps improve directions and fare estimates.
              </p>
              <div className="mt-2 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => persistRating(n === rating ? 0 : n)}
                    aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                    className="p-1"
                  >
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill={n <= rating ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={n <= rating ? "text-primary" : "text-muted-foreground"}
                    >
                      <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2" />
                    </svg>
                  </button>
                ))}
              </div>
              <textarea
                value={comment}
                onChange={(e) => persistComment(e.target.value)}
                placeholder="What worked, what didn't? (optional)"
                rows={2}
                className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
              {!activePlanId && (rating > 0 || comment.trim()) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Tap <b>Save outing</b> above to keep this rating.
                </p>
              )}
            </div>
          </section>
        )}

        {!directions && (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Type a place, use your location, or pick on the map to get started.
            Check the <b>Saved Outings</b> tab for your outings and recent trips.
          </p>
        )}
      </main>

      <footer className="mx-auto max-w-3xl px-4 py-8 text-center text-xs text-muted-foreground">
        Map data © OpenStreetMap · Search © Nominatim · Routing © OSRM
      </footer>

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
                Pick {stopLabel(pickTarget.index, stops.length).toLowerCase()}
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
                from={pickTarget.index === 0 ? null : filledStops[0] ?? null}
                to={
                  pickTarget.index === stops.length - 1
                    ? null
                    : filledStops[filledStops.length - 1] ?? null
                }
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
