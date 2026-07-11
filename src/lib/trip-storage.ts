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

const HISTORY_KEY = "naijanav.history.v1";
const BOOKMARKS_KEY = "naijanav.bookmarks.v1";
const MAX_HISTORY = 20;

function read(key: string): SavedTrip[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as SavedTrip[]) : [];
  } catch {
    return [];
  }
}
function write(key: string, list: SavedTrip[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {}
}

export function getHistory() {
  return read(HISTORY_KEY);
}
export function addToHistory(entry: Omit<SavedTrip, "id" | "savedAt">) {
  const list = read(HISTORY_KEY);
  // Dedupe by from+to pair — bump to top
  const key = `${entry.from.id}->${entry.to.id}`;
  const filtered = list.filter((t) => `${t.from.id}->${t.to.id}` !== key);
  const next: SavedTrip = {
    ...entry,
    id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    savedAt: Date.now(),
  };
  const out = [next, ...filtered].slice(0, MAX_HISTORY);
  write(HISTORY_KEY, out);
  return out;
}
export function clearHistory() {
  write(HISTORY_KEY, []);
}
export function removeHistory(id: string) {
  write(
    HISTORY_KEY,
    read(HISTORY_KEY).filter((t) => t.id !== id),
  );
}

export function getBookmarks() {
  return read(BOOKMARKS_KEY);
}
export function isBookmarked(fromId: string, toId: string) {
  return read(BOOKMARKS_KEY).some((b) => b.from.id === fromId && b.to.id === toId);
}
export function addBookmark(entry: Omit<SavedTrip, "id" | "savedAt">) {
  const list = read(BOOKMARKS_KEY);
  if (list.some((b) => b.from.id === entry.from.id && b.to.id === entry.to.id)) return list;
  const next: SavedTrip = {
    ...entry,
    id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    savedAt: Date.now(),
  };
  const out = [next, ...list];
  write(BOOKMARKS_KEY, out);
  return out;
}
export function removeBookmark(fromId: string, toId: string) {
  write(
    BOOKMARKS_KEY,
    read(BOOKMARKS_KEY).filter((b) => !(b.from.id === fromId && b.to.id === toId)),
  );
}
