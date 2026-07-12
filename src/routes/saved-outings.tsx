import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PlanList } from "@/components/TripLists";
import { getPlans, removePlan, setPendingStops, type SavedPlan } from "@/lib/trip-storage";

export const Route = createFileRoute("/saved-outings")({
  head: () => ({
    meta: [{ title: "Saved Outings — Abuja NavBuddy" }],
  }),
  component: SavedOutingsPage,
});

function SavedOutingsPage() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setPlans(getPlans());
  }, []);

  function openPlan(p: SavedPlan) {
    setPendingStops(p.stops);
    navigate({ to: "/" });
  }
  function deletePlan(p: SavedPlan) {
    setPlans(removePlan(p.id));
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto max-w-3xl px-3 py-3 sm:px-4 sm:py-4">
          <h1 className="font-display text-base font-extrabold tracking-tight sm:text-lg">
            Saved Outings
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Outings you've planned and saved.</p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-4 sm:py-10">
        {mounted && plans.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            Nothing here yet — plan a trip on Navigator or Day Planner and save it to see it here.
          </p>
        )}
        {plans.length > 0 && <PlanList items={plans} onOpen={openPlan} onRemove={deletePlan} />}
      </main>
    </div>
  );
}
