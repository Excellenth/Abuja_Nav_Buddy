import { type Place } from "@/data/abuja-places";
import { type Directions } from "@/lib/plan-trip";
import { AbujaMap } from "@/components/AbujaMap";

export function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
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

export function modeLabel(m: string) {
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

export function ModeIcon({ mode }: { mode: string }) {
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

/** Metrics + map + step-by-step movement advice for a computed trip. */
export function TripSteps({
  directions,
  from,
  to,
  mounted,
}: {
  directions: Directions;
  from: Place;
  to: Place;
  mounted: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Distance" value={`${directions.totalKm.toFixed(1)} km`} />
        <Metric label="Time" value={`~${directions.estMinutes} min`} />
        <Metric label="Fare" value={`₦${directions.totalPriceNgn.toLocaleString()}`} emphasis />
      </div>

      <div className="h-56 overflow-hidden rounded-2xl border border-border bg-muted sm:h-72">
        {mounted && <AbujaMap from={from} to={to} routeCoords={directions.routeCoords} />}
      </div>

      <ol className="space-y-2">
        {directions.steps.map((s, i) => (
          <li
            key={i}
            className={
              "flex items-start gap-3 rounded-2xl border border-border p-3 sm:p-4 " +
              (s.km === 0 && s.priceNgn === 0 && s.label.startsWith("Leg ") ? "bg-accent/40" : "bg-card")
            }
          >
            {s.km === 0 && s.priceNgn === 0 && s.label.startsWith("Leg ") ? (
              <p className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-wider text-primary">
                {s.label}
              </p>
            ) : (
              <>
                <div className="flex flex-col items-center">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
                    <ModeIcon mode={s.mode} />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="min-w-0 flex-1 text-sm font-semibold leading-snug sm:text-base">{s.label}</p>
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

      <p className="text-xs text-muted-foreground">
        Fares are estimates. Always confirm with the driver before boarding.
      </p>
    </div>
  );
}
