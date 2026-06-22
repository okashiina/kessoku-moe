import { createStore } from './externalStore';

// Saved-manga list ("My List" for manga), in localStorage
// (kessoku.mangaList.v1). Separate from the anime watchlist. Bookmark a series
// from its detail page; it shows in the Manga section of /watchlist alongside
// whatever you're mid-read on (from mangaProgress).
//
// Also carries a LOCAL reading status + personal score per series. These are
// localStorage-only for now (no AniList wiring — a sibling feature owns that),
// but the shapes are AniList-compatible on purpose: status maps onto AniList's
// manga MediaListStatus and score is stored as scoreRaw 0-100, so a future sync
// is a diff, not a migration.

// Local reading status. Names match the three states the manga shelf exposes;
// they map 1:1 onto AniList (READING→CURRENT, PLAN_TO_READ→PLANNING) when sync
// lands, so we keep AniList-ish wording without pulling in AniList types here.
export type MangaStatus = 'READING' | 'COMPLETED' | 'PLAN_TO_READ';

export interface MangaListEntry {
  id: number; // AniList manga id
  title: string;
  cover: string | null;
  country: string | null;
  addedAt: number;
  status?: MangaStatus;
  score?: number; // scoreRaw 0-100 (AniList-compatible), absent = unscored
}
export type MangaListMap = Record<number, MangaListEntry>;

// Just the fields needed to materialise an entry when status/score is set on a
// series that isn't bookmarked yet.
export type MangaEntryInfo = Pick<
  MangaListEntry,
  'title' | 'cover' | 'country'
>;

const store = createStore<MangaListMap>('kessoku.mangaList.v1', {});
export const subscribeMangaList = store.subscribe;
export const MANGA_LIST_EMPTY: MangaListEntry[] = [];

const clampScore = (n: number): number =>
  Math.max(0, Math.min(100, Math.round(n)));

export function isMangaSaved(id: number): boolean {
  return Boolean(store.get()[id]);
}

export function toggleMangaSaved(entry: Omit<MangaListEntry, 'addedAt'>): void {
  store.update((prev) => {
    const next = { ...prev };
    if (next[entry.id]) delete next[entry.id];
    else next[entry.id] = { ...entry, addedAt: Date.now() };
    return next;
  });
}

// Build (or fetch) the entry for `id`, applying `info` when creating so a
// status/score set from the detail page materialises a full, watchlist-ready
// tile. Returns the next map; callers mutate the returned entry.
function ensureEntry(
  prev: MangaListMap,
  id: number,
  info?: MangaEntryInfo
): { next: MangaListMap; entry: MangaListEntry } {
  const next = { ...prev };
  const existing = next[id];
  const entry: MangaListEntry = existing
    ? { ...existing }
    : {
        id,
        title: info?.title ?? 'Untitled',
        cover: info?.cover ?? null,
        country: info?.country ?? null,
        addedAt: Date.now(),
      };
  next[id] = entry;
  return { next, entry };
}

// If an entry has no bookmark intent left (no status, no score), and it was only
// created to hold one of those, drop it so clearing both removes it from the
// list. We can't tell a pure bookmark from a status-created entry, so: keep the
// entry whenever it still has a status or score; otherwise leave it (a real
// bookmark) untouched. ponytail: clearing status keeps the row if it still has a
// score (and vice-versa); only an explicit "Remove from list" / un-bookmark
// fully deletes — matches how anime treats status+score as additive overlays.

/** Current local reading status for a series, or null if none. */
export function getMangaStatus(id: number): MangaStatus | null {
  return store.get()[id]?.status ?? null;
}

/**
 * Set (or clear, with `null`) the local reading status. Setting it on a series
 * that isn't saved yet creates the entry so it shows in the watchlist.
 */
export function setMangaStatus(
  id: number,
  status: MangaStatus | null,
  info?: MangaEntryInfo
): void {
  store.update((prev) => {
    if ((prev[id]?.status ?? null) === status) return prev;
    if (status === null && !prev[id]) return prev;
    const { next, entry } = ensureEntry(prev, id, info);
    if (status === null) delete entry.status;
    else entry.status = status;
    return next;
  });
}

/** scoreRaw 0-100 for a series, or 0 when unscored. */
export function getMangaScore(id: number): number {
  return store.get()[id]?.score ?? 0;
}

/**
 * Set (or clear, with `null` / 0) the local personal score as scoreRaw 0-100
 * (clamped). Setting it on an unsaved series creates the entry.
 */
export function setMangaScore(
  id: number,
  scoreRaw: number | null,
  info?: MangaEntryInfo
): void {
  const v = scoreRaw === null ? 0 : clampScore(scoreRaw);
  store.update((prev) => {
    if ((prev[id]?.score ?? 0) === v) return prev;
    if (v === 0 && !prev[id]) return prev;
    const { next, entry } = ensureEntry(prev, id, info);
    if (v > 0) entry.score = v;
    else delete entry.score;
    return next;
  });
}

let lastMap: MangaListMap | undefined;
let lastList: MangaListEntry[] = [];
export function listSavedManga(): MangaListEntry[] {
  const map = store.get();
  if (map === lastMap) return lastList;
  lastMap = map;
  lastList = Object.values(map).sort((a, b) => b.addedAt - a.addedAt);
  return lastList;
}
