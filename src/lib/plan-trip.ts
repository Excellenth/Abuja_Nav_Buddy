import type { Place } from "@/data/abuja-places";

export type Step = {
  mode: "walk" | "keke" | "taxi" | "bus" | "metro";
  label: string;
  detail: string;
  km: number;
  priceNgn: number;
};

export type Directions = {
  steps: Step[];
  totalKm: number;
  totalPriceNgn: number;
  estMinutes: number;
  routeCoords: [number, number][]; // [lat, lng]
};

// Haversine
function distanceKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Very simple Abuja fare model (approximate, in Naira)
function keKePrice(km: number) {
  // Keke NAPEP: ~₦150 base up to ~2km, +₦100/km after
  return Math.max(150, Math.round((150 + Math.max(0, km - 2) * 100) / 50) * 50);
}
function taxiSharedPrice(km: number) {
  // Shared taxi: ~₦200 base, +₦120/km
  return Math.max(200, Math.round((200 + km * 120) / 50) * 50);
}
function busPrice(km: number) {
  // El-Rufai/gov green bus flat-ish: ~₦100 base + ₦40/km
  return Math.max(100, Math.round((100 + km * 40) / 50) * 50);
}

async function fetchOsrm(from: Place, to: Place): Promise<[number, number][] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const coords = json?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
    if (!coords) return null;
    return coords.map(([lng, lat]) => [lat, lng]);
  } catch {
    return null;
  }
}

export async function planTrip(from: Place, to: Place): Promise<Directions> {
  const routeCoords =
    (await fetchOsrm(from, to)) ?? [
      [from.lat, from.lng],
      [to.lat, to.lng],
    ];

  const totalKm = distanceKm([from.lat, from.lng], [to.lat, to.lng]);
  const steps: Step[] = [];

  // Short trip: single keke ride
  if (totalKm <= 4) {
    steps.push({
      mode: "walk",
      label: `Walk to the roadside near ${from.name}`,
      detail: "Stand where kekes and shared taxis stop — usually the main road entrance.",
      km: 0.2,
      priceNgn: 0,
    });
    steps.push({
      mode: "keke",
      label: `Take a Keke NAPEP toward ${to.name}`,
      detail: `Tell the driver "${to.name}". Confirm the fare before entering.`,
      km: totalKm,
      priceNgn: keKePrice(totalKm),
    });
    steps.push({
      mode: "walk",
      label: `Walk to ${to.name}`,
      detail: "Short walk from the drop-off point.",
      km: 0.2,
      priceNgn: 0,
    });
  } else if (totalKm <= 12) {
    // Medium: shared taxi
    steps.push({
      mode: "walk",
      label: `Walk to the taxi stop near ${from.name}`,
      detail: "Look for shared taxis (usually painted green/yellow).",
      km: 0.3,
      priceNgn: 0,
    });
    steps.push({
      mode: "taxi",
      label: `Board a shared taxi toward the nearest hub`,
      detail: "Say your destination area (Wuse, Garki, Jabi, etc.). Pay per seat.",
      km: totalKm * 0.7,
      priceNgn: taxiSharedPrice(totalKm * 0.7),
    });
    steps.push({
      mode: "keke",
      label: `Switch to a Keke to ${to.name}`,
      detail: "From the hub, take a keke on the local route.",
      km: totalKm * 0.3,
      priceNgn: keKePrice(totalKm * 0.3),
    });
  } else {
    // Long: government bus or intercity
    steps.push({
      mode: "walk",
      label: `Walk to the nearest bus stop from ${from.name}`,
      detail: "Green government buses run fixed routes across the FCT.",
      km: 0.4,
      priceNgn: 0,
    });
    steps.push({
      mode: "bus",
      label: `Take a green bus toward ${to.name}`,
      detail: "Buses are cheapest but slower. Board with cash — no cards.",
      km: totalKm * 0.8,
      priceNgn: busPrice(totalKm * 0.8),
    });
    steps.push({
      mode: "keke",
      label: `Take a Keke for the last stretch to ${to.name}`,
      detail: "Final leg from the drop-off to your destination.",
      km: totalKm * 0.2,
      priceNgn: keKePrice(totalKm * 0.2),
    });
  }

  const totalPriceNgn = steps.reduce((s, x) => s + x.priceNgn, 0);
  // Rough time estimate: 22km/h average with stops
  const estMinutes = Math.max(10, Math.round((totalKm / 22) * 60 + steps.length * 3));

  return { steps, totalKm, totalPriceNgn, estMinutes, routeCoords };
}
