import type { Place } from "@/data/abuja-places";

export type SavedTrip = {
  id: string;
  from: Place;
  to: Place;
  totalKm: number;
  totalPriceNgn: number;
  savedAt: number;
  title?: string;
};

export type SavedPlan = {
  id: string;
  name: string;
  stops: Place[];
  totalKm: number;
  totalPriceNgn: number;
  estMinutes?: number;
  rating?: number; // 1..5
  comment?: string;
  savedAt: number;
};

const BOOKMARKS_KEY = "naijanav.bookmarks.v1";
const PLANS_KEY = "naijanav.plans.v1";
const HOME_KEY = "naijanav.home.v1";
const PENDING_STOPS_KEY = "naijanav.pendingStops.v1";

function readList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as T[]) : [];
  } catch {
    return [];
  }
}
function writeList<T>(key: string, list: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

// ---------- Simple bookmarks (from/to pairs) ----------
export function getBookmarks() {
  return readList<SavedTrip>(BOOKMARKS_KEY);
}
export function isBookmarked(fromId: string, toId: string) {
  return readList<SavedTrip>(BOOKMARKS_KEY).some(
    (b) => b.from.id === fromId && b.to.id === toId,
  );
}
export function addBookmark(entry: Omit<SavedTrip, "id" | "savedAt">) {
  const list = readList<SavedTrip>(BOOKMARKS_KEY);
  if (list.some((b) => b.from.id === entry.from.id && b.to.id === entry.to.id))
    return list;
  const next: SavedTrip = {
    ...entry,
    id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    savedAt: Date.now(),
  };
  const out = [next, ...list];
  writeList(BOOKMARKS_KEY, out);
  return out;
}
export function removeBookmark(fromId: string, toId: string) {
  writeList(
    BOOKMARKS_KEY,
    readList<SavedTrip>(BOOKMARKS_KEY).filter(
      (b) => !(b.from.id === fromId && b.to.id === toId),
    ),
  );
}

// ---------- Named outings / multi-stop plans ----------
export function getPlans() {
  return readList<SavedPlan>(PLANS_KEY);
}
export function addPlan(entry: Omit<SavedPlan, "id" | "savedAt">) {
  const list = readList<SavedPlan>(PLANS_KEY);
  const next: SavedPlan = {
    ...entry,
    id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    savedAt: Date.now(),
  };
  const out = [next, ...list];
  writeList(PLANS_KEY, out);
  return out;
}
export function updatePlan(id: string, patch: Partial<SavedPlan>) {
  const list = readList<SavedPlan>(PLANS_KEY);
  const out = list.map((p) => (p.id === id ? { ...p, ...patch } : p));
  writeList(PLANS_KEY, out);
  return out;
}
export function removePlan(id: string) {
  const out = readList<SavedPlan>(PLANS_KEY).filter((p) => p.id !== id);
  writeList(PLANS_KEY, out);
  return out;
}

// ---------- Home place ----------
export function getHomePlace(): Place | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(HOME_KEY);
    return raw ? (JSON.parse(raw) as Place) : null;
  } catch {
    return null;
  }
}
export function setHomePlace(place: Place) {
  try {
    window.localStorage.setItem(HOME_KEY, JSON.stringify(place));
  } catch {}
}

// ---------- Pending stops handoff (Day Planner / Saved Outings -> Navigator) ----------
export function setPendingStops(stops: Place[]) {
  try {
    window.sessionStorage.setItem(PENDING_STOPS_KEY, JSON.stringify(stops));
  } catch {}
}
export function consumePendingStops(): Place[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PENDING_STOPS_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_STOPS_KEY);
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Place[]) : null;
  } catch {
    return null;
  }
}

// ---------- Generic per-page draft state (survives switching tabs, cleared when the tab closes) ----------
export function getDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
export function setDraft<T>(key: string, value: T) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
export function clearDraft(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {}
}
