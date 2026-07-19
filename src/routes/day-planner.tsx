import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Place } from "@/data/abuja-places";
import { PlacePicker } from "@/components/PlacePicker";
import { AbujaMap } from "@/components/AbujaMap";
import { TripSteps } from "@/components/TripResult";
import { geocodeOne, reverseGeocode } from "@/lib/geocode";
import { parseItinerary } from "@/lib/parse-itinerary";
import { planMultiTrip, type Directions } from "@/lib/plan-trip";
import { useNearestStopConfirm } from "@/hooks/use-nearest-stop-confirm";
import { addPlan, getDraft, getHomePlace, setDraft, setHomePlace, setPendingStops } from "@/lib/trip-storage";

export const Route = createFileRoute("/day-planner")({
  head: () => ({
    meta: [{ title: "Day Planner — Abuja NavBuddy" }],
  }),
  component: DayPlannerPage,
});

type ResolvedStop = { label: string; place: Place | null; isHome: boolean };

const DAY_PLANNER_DRAFT_KEY = "naijanav.dayPlannerDraft.v1";
type DayPlannerDraft = {
  text: string;
  stops: ResolvedStop[] | null;
  directions: Directions | null;
  savedName: string | null;
};

function stopColor(i: number, total: number) {
  if (i === 0) return "var(--primary)";
  if (i === total - 1) return "#b23a48";
  return "#c88a04";
}

function DayPlannerPage() {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stops, setStops] = useState<ResolvedStop[] | null>(null);
  const [pickIndex, setPickIndex] = useState<number | null>(null);
  const [pickBusy, setPickBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [computing, setComputing] = useState(false);
  const [directions, setDirections] = useState<Directions | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const recRef = useRef<any>(null);
  const { confirm, dialog: nearestStopDialog } = useNearestStopConfirm();

  useEffect(() => {
    setMounted(true);
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setVoiceSupported(!!SR);

    const draft = getDraft<DayPlannerDraft>(DAY_PLANNER_DRAFT_KEY);
    if (draft) {
      setText(draft.text);
      setStops(draft.stops);
      setDirections(draft.directions);
      setSavedName(draft.savedName);
    }
    setHydrated(true);
  }, []);

  // Keep in-progress state (typed itinerary, resolved stops, directions) across tab switches
  useEffect(() => {
    if (!hydrated) return;
    setDraft<DayPlannerDraft>(DAY_PLANNER_DRAFT_KEY, { text, stops, directions, savedName });
  }, [hydrated, text, stops, directions, savedName]);

  function toggleVoice() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (recording) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = "en-NG";
    rec.continuous = true;
    rec.interimResults = true;
    let base = text.trim();
    rec.onresult = (e: any) => {
      let finalChunk = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalChunk += chunk + " ";
        else interim += chunk;
      }
      if (finalChunk) base = (base ? base + " " : "") + finalChunk.trim();
      setText((base ? base + " " : "") + interim);
    };
    rec.onerror = () => setRecording(false);
    rec.onend = () => setRecording(false);
    rec.start();
    recRef.current = rec;
    setRecording(true);
  }

  async function handlePlan() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setParsing(true);
    setError(null);
    setStops(null);
    setDirections(null);
    setSavedName(null);
    try {
      const parsed = await parseItinerary(trimmed);
      if (parsed.length === 0) {
        setError("Couldn't find any stops in that — try naming a place or two.");
        return;
      }
      const home = getHomePlace();
      const resolved = await Promise.all(
        parsed.map(async (s): Promise<ResolvedStop> => {
          const isHome = s.label.trim().toLowerCase() === "home";
          if (isHome && home) return { label: s.label, place: home, isHome };
          if (!s.resolvable || !s.query.trim()) return { label: s.label, place: null, isHome };
          const place = await geocodeOne(s.query);
          return { label: s.label, place, isHome };
        }),
      );
      setStops(resolved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't plan that route right now.");
    } finally {
      setParsing(false);
    }
  }

  function setStopPlace(i: number, place: Place | null) {
    setStops((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[i] = { ...next[i], place };
      return next;
    });
    setDirections(null);
    setSavedName(null);
  }

  function removeStop(i: number) {
    setStops((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev));
    setDirections(null);
    setSavedName(null);
  }

  async function handleMapPick(lat: number, lng: number) {
    if (pickIndex === null || pickBusy) return;
    setPickBusy(true);
    const raw = await reverseGeocode(lat, lng);
    const place = await confirm(raw);
    setStopPlace(pickIndex, place);
    setPickIndex(null);
    setPickBusy(false);
  }

  const filledPlaces = useMemo(
    () => (stops ?? []).map((s) => s.place).filter((p): p is Place => !!p),
    [stops],
  );
  const canMove = stops !== null && filledPlaces.length >= 2 && filledPlaces.length === stops.length;

  async function handleAdviseMovement() {
    if (!canMove) return;
    setComputing(true);
    setError(null);
    try {
      const d = await planMultiTrip(filledPlaces);
      setDirections(d);

      const dayName = new Date().toLocaleDateString(undefined, { weekday: "long" });
      const first = filledPlaces[0];
      const last = filledPlaces[filledPlaces.length - 1];
      const name =
        filledPlaces.length > 2
          ? `${dayName}'s plan: ${first.name} → ${last.name} (+${filledPlaces.length - 2} stops)`
          : `${dayName}'s plan: ${first.name} → ${last.name}`;
      addPlan({
        name,
        stops: filledPlaces,
        totalFareNgn: d.totalFareNgn,
        totalTimeMin: d.totalTimeMin,
        legCount: d.legCount,
      });
      setSavedName(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't plan that route right now.");
    } finally {
      setComputing(false);
    }
  }

  function openInNavigator() {
    setPendingStops(filledPlaces);
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-3 py-3 sm:px-4 sm:py-4">
          <h1 className="font-display text-base font-extrabold tracking-tight sm:text-lg">
            Day Planner
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tell it about your day — it'll plan it, save it, and advise you on how to move.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-10">
        <section className="rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)] sm:p-6">
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                'e.g. "Today I go clinic, from there to Maitama to see my sis. From there go to church then home."'
              }
              rows={4}
              disabled={recording}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30 disabled:opacity-70"
            />
            {voiceSupported && (
              <button
                type="button"
                onClick={toggleVoice}
                aria-label={recording ? "Stop recording" : "Speak your day"}
                className={
                  "absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full transition " +
                  (recording
                    ? "bg-destructive text-destructive-foreground animate-pulse"
                    : "bg-accent text-primary hover:bg-primary hover:text-primary-foreground")
                }
              >
                {recording ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="3" width="6" height="12" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                )}
              </button>
            )}
          </div>
          {!voiceSupported && (
            <p className="mt-2 text-xs text-muted-foreground">
              Voice input isn't supported on this browser — type your day instead.
            </p>
          )}
          {recording && (
            <p className="mt-2 text-xs font-medium text-destructive">Listening… tap the square to stop.</p>
          )}

          <button
            onClick={handlePlan}
            disabled={!text.trim() || parsing || recording}
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-50"
          >
            {parsing ? "Reading your day…" : "Plan my day"}
          </button>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </section>

        {stops && (
          <section className="mt-6 space-y-4">
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Confirm your stops
            </h2>
            <p className="text-xs text-muted-foreground">
              We guessed these from what you said — tap any stop to search, use your location, or pick it on the map.
            </p>
            <div className="grid gap-4">
              {stops.map((s, i) => (
                <div key={i} className="min-w-0">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: stopColor(i, stops.length) }}
                      />
                      {s.label}
                    </span>
                    {stops.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeStop(i)}
                        className="text-xs font-medium text-muted-foreground hover:text-destructive"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <PlacePicker
                    label=""
                    value={s.place}
                    onChange={(p) => setStopPlace(i, p)}
                    dotColor={stopColor(i, stops.length)}
                    onRequestMapPick={() => setPickIndex(i)}
                    onResolve={confirm}
                  />
                  {s.isHome && s.place && (
                    <button
                      type="button"
                      onClick={() => setHomePlace(s.place!)}
                      className="mt-1.5 text-xs font-medium text-primary hover:opacity-80"
                    >
                      Save as my Home for next time
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handleAdviseMovement}
              disabled={!canMove || computing}
              className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {computing ? "Working out your movements…" : "Plan my movements"}
            </button>
          </section>
        )}

        {directions && filledPlaces.length >= 2 && (
          <section className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="min-w-0 truncate font-display text-sm font-bold uppercase tracking-wider text-muted-foreground">
                How you'll move
              </h2>
              <button
                type="button"
                onClick={openInNavigator}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground transition hover:border-primary/40"
              >
                Open in Navigator
              </button>
            </div>
            {savedName && (
              <p className="text-xs font-medium text-primary">
                ✓ Saved to your outings as "{savedName}"
              </p>
            )}
            <TripSteps
              directions={directions}
              from={filledPlaces[0]}
              to={filledPlaces[filledPlaces.length - 1]}
              mounted={mounted}
            />
          </section>
        )}
      </main>

      {pickIndex !== null && stops && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-background h-dvh-safe"
          style={{
            paddingTop: "env(safe-area-inset-top)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <button
              onClick={() => setPickIndex(null)}
              className="rounded-full px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              ← Cancel
            </button>
            <div className="min-w-0 flex-1 text-center">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pick {stops[pickIndex].label.toLowerCase()}
              </div>
              <div className="truncate text-sm font-semibold">
                {pickBusy ? "Getting address…" : "Tap anywhere on the map"}
              </div>
            </div>
            <div className="w-[68px]" />
          </div>
          <div className="relative flex-1">
            <AbujaMap pickMode onPick={handleMapPick} />
            <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl border border-border bg-card/95 px-4 py-2 text-center text-xs text-muted-foreground shadow-lg backdrop-blur">
              Tip: pinch to zoom, drag to pan, tap a spot to select it.
            </div>
          </div>
        </div>
      )}
      {nearestStopDialog}
    </div>
  );
}
