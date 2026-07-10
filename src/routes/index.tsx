import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { CATEGORIES, PLACES, type Category } from "@/data/abuja-places";

const AbujaMap = lazy(() =>
  import("@/components/AbujaMap").then((m) => ({ default: m.AbujaMap })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NaijaNav Abuja — Find your way around the FCT" },
      {
        name: "description",
        content:
          "A friendly guide for newcomers to Abuja, FCT. Search landmarks, markets, hospitals and transport with a live OpenStreetMap.",
      },
      { property: "og:title", content: "NaijaNav Abuja — Find your way around the FCT" },
      {
        property: "og:description",
        content:
          "Live map + newcomer tips to help you settle into Abuja, Nigeria's capital.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("All");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PLACES.filter(
      (p) =>
        (category === "All" || p.category === category) &&
        (q === "" ||
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)),
    );
  }, [query, category]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Header />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-95"
          style={{ background: "var(--gradient-hero)" }}
          aria-hidden
        />
        <div className="absolute inset-0 opacity-20" aria-hidden style={{
          backgroundImage: "radial-gradient(circle at 20% 20%, white 0.5px, transparent 1px)",
          backgroundSize: "24px 24px",
        }} />
        <div className="relative mx-auto grid max-w-6xl gap-6 px-4 pb-10 pt-14 sm:pb-14 sm:pt-20 md:grid-cols-[1.1fr_1fr] md:items-center">
          <div className="text-primary-foreground">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Made for newcomers to Abuja · FCT
            </div>
            <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl md:text-6xl">
              Find your way around <span className="whitespace-nowrap">the capital.</span>
            </h1>
            <p className="mt-4 max-w-lg text-base text-white/90 sm:text-lg">
              Search landmarks, markets, hospitals and transport hubs across Abuja — with a live map, tips and directions.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href="#explore"
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-3 text-sm font-semibold text-primary shadow-lg transition hover:translate-y-[-1px]"
              >
                Explore the map
              </a>
              <a
                href="#tips"
                className="inline-flex items-center justify-center rounded-full border border-white/40 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                Newcomer tips
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-white/90">
              <Stat n="16+" label="Key locations" />
              <Stat n="6" label="Categories" />
              <Stat n="Live" label="OSM map" />
            </div>
          </div>

          <div className="relative hidden md:block">
            <div className="rounded-3xl border border-white/20 bg-white/10 p-2 shadow-2xl backdrop-blur">
              <div className="h-[320px] overflow-hidden rounded-2xl">
                <Suspense fallback={<MapSkeleton />}>
                  <AbujaMap places={PLACES.slice(0, 6)} />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Explore */}
      <section id="explore" className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
        <div className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold sm:text-3xl">Explore Abuja</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Filter places and tap a card to zoom the live map.
            </p>
          </div>
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm md:hidden"
          >
            {drawerOpen ? "Hide list" : "Show list"}
          </button>
        </div>

        {/* Search + filters */}
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search e.g. Wuse Market, airport, hospital…"
              className="w-full rounded-full border border-border bg-card px-5 py-3 text-sm shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30"
              aria-label="Search places"
            />
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={
                  "shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition " +
                  (category === c
                    ? "border-primary bg-primary text-primary-foreground shadow"
                    : "border-border bg-card text-foreground hover:border-primary/40")
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {/* List */}
          <div
            className={
              "space-y-2 " +
              (drawerOpen ? "block" : "hidden md:block") +
              " max-h-[520px] overflow-y-auto pr-1"
            }
          >
            {filtered.length === 0 && (
              <div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                No places match your search.
              </div>
            )}
            {filtered.map((p) => {
              const active = p.id === activeId;
              return (
                <button
                  key={p.id}
                  onClick={() => setActiveId(p.id)}
                  className={
                    "group flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition " +
                    (active
                      ? "border-primary bg-accent shadow-[var(--shadow-elegant)]"
                      : "border-border bg-card hover:border-primary/40 hover:shadow-[var(--shadow-card)]")
                  }
                >
                  <div
                    className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-primary-foreground"
                    style={{ background: "var(--gradient-hero)" }}
                  >
                    <CategoryIcon category={p.category} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{p.name}</h3>
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wider text-primary">
                      {p.category}
                    </div>
                    {p.description && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {p.description}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Map */}
          <div className="h-[420px] overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-card)] md:h-[520px]">
            <Suspense fallback={<MapSkeleton />}>
              <AbujaMap places={filtered} activeId={activeId} onSelect={setActiveId} />
            </Suspense>
          </div>
        </div>
      </section>

      {/* Tips */}
      <section id="tips" className="border-t border-border" style={{ background: "var(--gradient-subtle)" }}>
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <h2 className="text-2xl font-bold sm:text-3xl">Newcomer tips</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            A few essentials to help you settle in and move around Abuja confidently.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TIPS.map((t) => (
              <article
                key={t.title}
                className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5"
              >
                <div
                  className="grid h-10 w-10 place-items-center rounded-xl text-primary-foreground"
                  style={{ background: "var(--gradient-hero)" }}
                >
                  <span className="text-lg font-bold">{t.emoji}</span>
                </div>
                <h3 className="mt-3 text-lg font-bold">{t.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <Logo />
            <span>NaijaNav Abuja · Built for newcomers to the FCT</span>
          </div>
          <span>Map data © OpenStreetMap contributors</span>
        </div>
      </footer>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
        <a href="#" className="flex min-w-0 items-center gap-2">
          <Logo />
          <span className="truncate font-display text-lg font-extrabold tracking-tight">
            NaijaNav <span className="text-primary">Abuja</span>
          </span>
        </a>
        <nav className="flex shrink-0 items-center gap-1 text-sm font-medium">
          <a href="#explore" className="rounded-full px-3 py-2 hover:bg-accent">Explore</a>
          <a href="#tips" className="rounded-full px-3 py-2 hover:bg-accent">Tips</a>
          <a
            href="#explore"
            className="ml-1 hidden rounded-full bg-primary px-4 py-2 text-primary-foreground shadow-sm hover:opacity-95 sm:inline-flex"
          >
            Open map
          </a>
        </nav>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-primary-foreground shadow"
      style={{ background: "var(--gradient-hero)" }}
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    </span>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="min-w-0">
      <div className="font-display text-2xl font-extrabold">{n}</div>
      <div className="text-xs uppercase tracking-wider text-white/80">{label}</div>
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="grid h-full w-full place-items-center bg-muted text-sm text-muted-foreground">
      Loading map…
    </div>
  );
}

function CategoryIcon({ category }: { category: string }) {
  const paths: Record<string, ReactNode> = {
    Landmark: <path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" />,
    Transport: <><rect x="4" y="5" width="16" height="12" rx="2" /><path d="M4 13h16M8 17v2M16 17v2" /></>,
    Market: <><path d="M3 7h18l-2 5H5L3 7Z" /><path d="M5 12v8h14v-8" /></>,
    Hospital: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 8v8M8 12h8" /></>,
    Government: <><path d="M3 21h18M5 21V10l7-4 7 4v11" /><path d="M9 21v-6M15 21v-6" /></>,
    Leisure: <><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[category] ?? <circle cx="12" cy="12" r="4" />}
    </svg>
  );
}

const TIPS = [
  { emoji: "🚕", title: "Getting around", body: "Use Bolt or inDrive for trusted rides. Kabu-kabu (shared taxis) run fixed routes — ask locals for the fare before boarding." },
  { emoji: "🚌", title: "Public transport", body: "Green government buses and the Abuja Metro (Airport line) are cheap and safe. Peak hours are 7–9am and 4–7pm." },
  { emoji: "🏙️", title: "Know the districts", body: "Wuse, Garki, Maitama, Asokoro, Jabi, Utako, Gwarinpa. Central Business District is the city's core." },
  { emoji: "💧", title: "Weather & seasons", body: "Rainy season is May–October; harmattan (dry, dusty) is December–February. Carry water year-round." },
  { emoji: "🍲", title: "Where to eat", body: "Try suya at Wuse or Jabi, jollof at any local bukka, and lakeside dining at Jabi Lake Mall." },
  { emoji: "🛡️", title: "Stay safe", body: "Avoid isolated areas at night, keep emergency numbers handy (112), and always agree on taxi fares upfront." },
];
