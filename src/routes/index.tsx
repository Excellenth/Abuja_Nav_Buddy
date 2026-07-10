import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PLACES, type Place } from "@/data/abuja-places";
import { planTrip, type Directions } from "@/lib/plan-trip";
import { AbujaMap } from "@/components/AbujaMap";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NaijaNav Abuja — Directions & transport fares" },
      {
        name: "description",
        content:
          "Enter your start and stop in Abuja and get step-by-step directions with public transport prices in Naira.",
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

function Home() {
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [directions, setDirections] = useState<Directions | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const from = useMemo(() => PLACES.find((p) => p.id === fromId) ?? null, [fromId]);
  const to = useMemo(() => PLACES.find((p) => p.id === toId) ?? null, [toId]);

  async function onGo() {
    if (!from || !to || from.id === to.id) return;
    setLoading(true);
    try {
      const d = await planTrip(from, to);
      setDirections(d);
    } finally {
      setLoading(false);
    }
  }

  function swap() {
    setFromId(toId);
    setToId(fromId);
    setDirections(null);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-4">
          <span
            className="grid h-8 w-8 place-items-center rounded-lg text-primary-foreground"
            style={{ background: "var(--gradient-hero)" }}
            aria-hidden
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
          </span>
          <h1 className="font-display text-lg font-extrabold tracking-tight">
            NaijaNav <span className="text-primary">Abuja</span>
          </h1>
          <span className="ml-auto text-xs text-muted-foreground">FCT · Public transport</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
        {/* Form */}
        <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-6">
          <div className="grid gap-3">
            <PlaceField
              label="From"
              value={fromId}
              onChange={setFromId}
              excludeId={toId}
              dotColor="var(--primary)"
            />
            <div className="flex justify-center">
              <button
                onClick={swap}
                disabled={!fromId && !toId}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-40"
                aria-label="Swap start and stop"
              >
                ↑↓ Swap
              </button>
            </div>
            <PlaceField
              label="Stop"
              value={toId}
              onChange={setToId}
              excludeId={fromId}
              dotColor="#b23a48"
            />
            <button
              onClick={onGo}
              disabled={!from || !to || from?.id === to?.id || loading}
              className="mt-2 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {loading ? "Planning route…" : "Get directions"}
            </button>
          </div>
        </section>

        {/* Results */}
        {directions && from && to && (
          <section className="mt-6 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Distance" value={`${directions.totalKm.toFixed(1)} km`} />
              <Metric label="Time" value={`~${directions.estMinutes} min`} />
              <Metric
                label="Fare"
                value={`₦${directions.totalPriceNgn.toLocaleString()}`}
                emphasis
              />
            </div>

            <div className="h-[260px] overflow-hidden rounded-2xl border border-border bg-muted">
              {mounted && (
                <AbujaMap from={from} to={to} routeCoords={directions.routeCoords} />
              )}
            </div>

            <ol className="space-y-2">
              {directions.steps.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4"
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
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-semibold leading-snug">{s.label}</p>
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
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Pick a start and stop to see step-by-step directions and public transport fares.
          </p>
        )}
      </main>

      <footer className="mx-auto max-w-3xl px-4 py-8 text-center text-xs text-muted-foreground">
        Map data © OpenStreetMap contributors · Routing via OSRM
      </footer>
    </div>
  );
}

function PlaceField({
  label,
  value,
  onChange,
  excludeId,
  dotColor,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  excludeId?: string;
  dotColor: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: dotColor }}
        />
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-border bg-background px-4 py-3 text-base font-medium shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
      >
        <option value="">Choose a location…</option>
        {PLACES.filter((p) => p.id !== excludeId).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Metric({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        "rounded-2xl border p-3 text-center " +
        (emphasis
          ? "border-primary bg-accent"
          : "border-border bg-card")
      }
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-0.5 font-display text-lg font-extrabold " +
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
  const stroke = "currentColor";
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
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
  // keke / taxi
  return (
    <svg {...common}>
      <path d="M4 17V11l3-5h10l3 5v6" />
      <circle cx="8" cy="18" r="1.8" />
      <circle cx="16" cy="18" r="1.8" />
    </svg>
  );
}
