import type { Place } from "@/data/abuja-places";
import { BackendError, planTripFromNodes, planTripFromText, type TransportMode, type TripResponse, type TripStep } from "@/lib/backend-api";

export type Step = {
  type: "walk" | "ride";
  mode: TransportMode | "walk";
  label: string;
  detail: string;
  fareNgn: number | null;
  timeMin: number | null;
  distanceM: number | null;
  estimated: boolean;
};

export type Directions = {
  steps: Step[];
  totalFareNgn: number | null;
  totalTimeMin: number;
  legCount: number;
  routeCoords: [number, number][]; // [lat, lng]
  includesEstimatedLegs: boolean;
  // Leg descriptions ("A → B") where the backend found no route at all --
  // surfaced so the UI can say so plainly instead of silently dropping the leg.
  notFoundLegs: string[];
};

const MODE_LABEL: Record<string, string> = {
  walk: "Walking",
  okada: "Okada (motorbike)",
  keke_napep: "Keke NAPEP",
  minibus: "Minibus",
  shared_taxi: "Shared taxi",
};

export function modeLabel(mode: string): string {
  return MODE_LABEL[mode] ?? mode;
}

function stepLabel(s: TripStep): string {
  if (s.type === "walk") {
    return `Walk to ${s.to_landmark ? `${s.to_name} (${s.to_landmark})` : s.to_name}`;
  }
  const to = s.to_landmark ? `${s.to_name} (${s.to_landmark})` : s.to_name;
  return `${modeLabel(s.mode ?? "")} to ${to}`;
}

function stepDetail(s: TripStep): string {
  if (s.type === "walk") {
    return s.from_landmark ? `From ${s.from_name} (${s.from_landmark})` : `From ${s.from_name}`;
  }
  const from = s.from_landmark ? `${s.from_name} (${s.from_landmark})` : s.from_name;
  const caveat = s.estimated ? " — estimated, not yet field-verified" : "";
  return `Board at ${from}${caveat}`;
}

function toStep(s: TripStep): Step {
  return {
    type: s.type,
    mode: s.type === "walk" ? "walk" : (s.mode ?? "shared_taxi"),
    label: stepLabel(s),
    detail: stepDetail(s),
    fareNgn: s.fare_ngn,
    timeMin: s.time_min,
    distanceM: s.distance_m,
    estimated: s.estimated,
  };
}

function stepCoords(s: TripStep): [number, number][] {
  const coords: [number, number][] = [];
  if (s.from_lat != null && s.from_lng != null) coords.push([s.from_lat, s.from_lng]);
  if (s.to_lat != null && s.to_lng != null) coords.push([s.to_lat, s.to_lng]);
  return coords;
}

async function planLeg(a: Place, b: Place): Promise<TripResponse> {
  if (a.nodeId != null && b.nodeId != null) {
    return planTripFromNodes(a.nodeId, b.nodeId);
  }
  try {
    return await planTripFromText(a.name, b.name);
  } catch (e) {
    if (e instanceof BackendError) {
      return { found: false, message: e.message, steps: [], total_fare_ngn: null, total_time_min: null, leg_count: null, includes_estimated_legs: false };
    }
    throw e;
  }
}

export async function planTrip(from: Place, to: Place): Promise<Directions> {
  return planMultiTrip([from, to]);
}

export async function planMultiTrip(stops: Place[]): Promise<Directions> {
  if (stops.length < 2) throw new Error("Need at least two stops");

  const allSteps: Step[] = [];
  const allCoords: [number, number][] = [];
  const notFoundLegs: string[] = [];
  let totalFareNgn: number | null = 0;
  let totalTimeMin = 0;
  let legCount = 0;
  let anyEstimated = false;
  let anyFareUnknown = false;

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];

    if (stops.length > 2) {
      allSteps.push({
        type: "walk",
        mode: "walk",
        label: `Leg ${i + 1}: ${a.name} → ${b.name}`,
        detail: "",
        fareNgn: null,
        timeMin: null,
        distanceM: null,
        estimated: false,
      });
    }

    const trip = await planLeg(a, b);
    if (!trip.found) {
      notFoundLegs.push(`${a.name} → ${b.name}`);
      allSteps.push({
        type: "walk",
        mode: "walk",
        label: `No known route yet from ${a.name} to ${b.name}`,
        detail: trip.message ?? "Try picking a different nearby stop.",
        fareNgn: null,
        timeMin: null,
        distanceM: null,
        estimated: false,
      });
      continue;
    }

    for (const s of trip.steps) {
      allSteps.push(toStep(s));
      allCoords.push(...stepCoords(s));
    }
    if (trip.total_fare_ngn == null) anyFareUnknown = true;
    else if (totalFareNgn != null) totalFareNgn += trip.total_fare_ngn;
    totalTimeMin += trip.total_time_min ?? 0;
    legCount += trip.leg_count ?? 0;
    if (trip.includes_estimated_legs) anyEstimated = true;
  }

  return {
    steps: allSteps,
    totalFareNgn: anyFareUnknown ? null : totalFareNgn,
    totalTimeMin,
    legCount,
    routeCoords: allCoords,
    includesEstimatedLegs: anyEstimated,
    notFoundLegs,
  };
}
