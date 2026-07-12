import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { type Place } from "@/data/abuja-places";
import { planMultiTrip, type Directions } from "@/lib/plan-trip";
import { AbujaMap } from "@/components/AbujaMap";
import { PlacePicker, reverseGeocode } from "@/components/PlacePicker";
import {
  addPlan,
  addToHistory,
  getHistory,
  getPlans,
  removeHistory,
  removePlan,
  updatePlan,
  type SavedPlan,
  type SavedTrip,
} from "@/lib/trip-storage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NaijaNav Abuja — Directions, fares & outings" },
      {
        name: "description",
        content:
          "Plan multi-stop trips across Abuja with step-by-step directions and public transport fares. Voice search, bookmarks, and outing planning.",
      },
      { property: "og:title", content: "NaijaNav Abuja — Directions, fares & outings" },
      {
        property: "og:description",
        content: "Multi-stop Abuja trip planner with voice search and fare estimates.",
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
  const [history, setHistory] = useState<SavedTrip[]>([]);
  const [plans, setPlans] = useState<SavedPlan[]>([]);

  // For the current active plan (saved)
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    setMounted(true);
    setHistory(getHistory());
    setPlans(getPlans());
  }, []);

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
      // Only 2-stop trips go into the quick "recent" history
      if (filledStops.length === 2) {
        const updated = addToHistory({
          from: filledStops[0],
          to: filledStops[1],
          totalKm: d.totalKm,
          totalPriceNgn: d.totalPriceNgn,
        });
        setHistory(updated);
      }
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
    setPlans(updated);
    setActivePlanId(updated[0].id);
  }

  function persistRating(next: number) {
    setRating(next);
    if (activePlanId) {
      setPlans(updatePlan(activePlanId, { rating: next }));
    }
  }
  function persistComment(next: string) {
    setComment(next);
    if (activePlanId) {
      setPlans(updatePlan(activePlanId, { comment: next.trim() || undefined }));
    }
  }

  function loadPlan(p: SavedPlan) {
    setStops(p.stops);
    setDirections(null);
    setActivePlanId(p.id);
    setRating(p.rating ?? 0);
    setComment(p.comment ?? "");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function deletePlan(p: SavedPlan) {
    const next = removePlan(p.id);
    setPlans(next);
    if (activePlanId === p.id) setActivePlanId(null);
  }

  function loadHistory(t: SavedTrip) {
    setStops([t.from, t.to]);
    setDirections(null);
    setActivePlanId(null);
    setRating(0);
    setComment("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function deleteHistoryItem(id: string) {
    removeHistory(id);
    setHistory(getHistory());
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
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-primary-foreground"
            style={{ background: "var(--gradient-hero)" }}
            aria-hidden
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" />
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
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary bg-accent px-3 py-1.5 text-xs font-semibold text-primary transition hover:opacity-90"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
                </svg>
                {activePlanId ? "Saved" : "Save outing"}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Metric label="Distance" value={`${directions.totalKm.toFixed(1)} km`} />
              <Metric label="Time" value={`~${directions.estMinutes} min`} />
              <Metric label="Fare" value={`₦${directions.totalPriceNgn.toLocaleString()}`} emphasis />
            </div>

            <div className="h-56 overflow-hidden rounded-2xl border border-border bg-muted sm:h-72">
              {mounted && (
                <AbujaMap
                  from={filledStops[0]}
                  to={filledStops[filledStops.length - 1]}
                  routeCoords={directions.routeCoords}
                />
              )}
            </div>

            <ol className="space-y-2">
              {directions.steps.map((s, i) => (
                <li
                  key={i}
                  className={
                    "flex items-start gap-3 rounded-2xl border border-border p-3 sm:p-4 " +
                    (s.km === 0 && s.priceNgn === 0 && s.label.startsWith("Leg ")
                      ? "bg-accent/40"
                      : "bg-card")
                  }
                >
                  {s.km === 0 && s.priceNgn === 0 && s.label.startsWith("Leg ") ? (
                    <p className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wider text-primary">
                      {s.label}
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-col items-center">
                        <div
                          className="grid h-9 w-9 place-items-center rounded-full text-primary-foreground"
                          style={{ background: "var(--gradient-hero)" }}
                        >
                          <ModeIcon mode={s.mode} />
                        </div>
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
                    </>
                  )}
                </li>
              ))}
            </ol>

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

            <p className="text-xs text-muted-foreground">
              Fares are estimates. Always confirm with the driver before boarding.
            </p>
          </section>
        )}

        {!directions && (
          <div className="mt-6 space-y-6">
            {plans.length === 0 && history.length === 0 && (
              <p className="text-center text-sm text-muted-foreground">
                Type a place, tap the mic to speak, use your location, or pick on the map to get started.
              </p>
            )}

            {plans.length > 0 && (
              <PlanList items={plans} onOpen={loadPlan} onRemove={deletePlan} />
            )}

            {history.length > 0 && (
              <HistoryList
                items={history}
                onOpen={loadHistory}
                onRemove={(t) => deleteHistoryItem(t.id)}
              />
            )}
          </div>
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
      <div
        className={
          "mt-0.5 truncate font-display text-base font-extrabold sm:text-lg " +
          (emphasis ? "text-primary" : "")
        }
      >
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

function PlanList({
  items,
  onOpen,
  onRemove,
}: {
  items: SavedPlan[];
  onOpen: (p: SavedPlan) => void;
  onRemove: (p: SavedPlan) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" />
          </svg>
        </span>
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Saved outings
        </h3>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      <ul className="space-y-2">
        {items.map((p) => (
          <li key={p.id}>
            <div className="flex items-stretch gap-2 rounded-2xl border border-border bg-card p-3 sm:p-4">
              <button
                type="button"
                onClick={() => onOpen(p)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold">{p.name}</span>
                  {p.rating ? (
                    <span className="shrink-0 text-xs font-semibold text-primary">
                      {"★".repeat(p.rating)}
                      <span className="text-muted-foreground">{"★".repeat(5 - p.rating)}</span>
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {p.stops.map((s) => s.name).join(" → ")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p.stops.length} stops · {p.totalKm.toFixed(1)} km · ₦
                  {p.totalPriceNgn.toLocaleString()}
                </p>
                {p.comment && (
                  <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">
                    "{p.comment}"
                  </p>
                )}
              </button>
              <button
                type="button"
                onClick={() => onRemove(p)}
                aria-label={`Remove ${p.name}`}
                className="shrink-0 self-start rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HistoryList({
  items,
  onOpen,
  onRemove,
}: {
  items: SavedTrip[];
  onOpen: (t: SavedTrip) => void;
  onRemove: (t: SavedTrip) => void;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-accent text-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <h3 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
          Recent trips
        </h3>
        <span className="text-xs text-muted-foreground">({items.length})</span>
      </div>
      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t.id}>
            <div className="flex items-stretch gap-2 rounded-2xl border border-border bg-card p-3 sm:p-4">
              <button
                onClick={() => onOpen(t)}
                className="min-w-0 flex-1 text-left"
                aria-label={`Load trip from ${t.from.name} to ${t.to.name}`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <span className="truncate text-sm font-semibold">{t.from.name}</span>
                </div>
                <div className="my-1 ml-[3px] h-3 w-px bg-border" />
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: "#b23a48" }}
                  />
                  <span className="truncate text-sm font-semibold">{t.to.name}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t.totalKm.toFixed(1)} km · ₦{t.totalPriceNgn.toLocaleString()}
                </p>
              </button>
              <button
                type="button"
                onClick={() => onRemove(t)}
                aria-label="Remove"
                className="shrink-0 self-start rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
