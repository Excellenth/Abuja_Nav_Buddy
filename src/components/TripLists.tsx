import type { SavedPlan } from "@/lib/trip-storage";

export function PlanList({
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
                  {p.stops.length} stops · ~{Math.round(p.totalTimeMin)} min ·{" "}
                  {p.totalFareNgn != null ? `₦${p.totalFareNgn.toLocaleString()}` : "fare not fully known"}
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
