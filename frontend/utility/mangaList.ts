import { createStore } from './externalStore';

// Saved-manga list ("My List" for manga), in localStorage
// (kessoku.mangaList.v1). Separate from the anime watchlist. Bookmark a series
// from its detail page; it shows in the Manga section of /watchlist alongside
// whatever you're mid-read on (from mangaProgress).

export interface MangaListEntry {
  id: number; // AniList manga id
  title: string;
  cover: string | null;
  country: string | null;
  addedAt: number;
}
export type MangaListMap = Record<number, MangaListEntry>;

const store = createStore<MangaListMap>('kessoku.mangaList.v1', {});
export const subscribeMangaList = store.subscribe;
export const MANGA_LIST_EMPTY: MangaListEntry[] = [];

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

let lastMap: MangaListMap | undefined;
let lastList: MangaListEntry[] = [];
export function listSavedManga(): MangaListEntry[] {
  const map = store.get();
  if (map === lastMap) return lastList;
  lastMap = map;
  lastList = Object.values(map).sort((a, b) => b.addedAt - a.addedAt);
  return lastList;
}
