import { createStore } from './externalStore';

// Manga reading progress, keyed by AniList manga id, in localStorage
// (`kessoku.mangaProgress.v1`). Mirrors utility/progress.ts (watch progress) but
// tracks chapters/pages instead of episodes/seconds. Reader-only writes; powers
// the "Continue reading" rail + resume. AniList MediaList sync (progress =
// chapters read, type: MANGA) is a later phase — this is the local layer.

export interface MangaProgressEntry {
  ch: number; // last-read chapter number (supports 12.5)
  chapterId: string; // MangaDex chapter id to resume into
  page: number; // last page index within that chapter
  pages: number; // page count of that chapter; 0 = unknown
  total: number; // total chapters for the title; 0 = unknown
  lang: string; // preferred translation language for this series
  read: number[]; // chapter numbers marked read (sorted unique)
  title: string; // cached display title (for the rail without a refetch)
  cover: string | null; // cached cover URL (AniList)
  updatedAt: number;
}
export type MangaProgressMap = Record<number, MangaProgressEntry>;
export interface MangaContinueItem {
  id: number;
  entry: MangaProgressEntry;
}

const KEY = 'kessoku.mangaProgress.v1';
const store = createStore<MangaProgressMap>(KEY, {});
export const subscribeMangaProgress = store.subscribe;
export const MANGA_CONTINUE_EMPTY: MangaContinueItem[] = [];

export function getMangaEntry(id: number): MangaProgressEntry | undefined {
  return store.get()[id];
}

export function saveMangaPosition(
  id: number,
  p: {
    ch: number;
    chapterId: string;
    page: number;
    pages: number;
    total?: number;
    lang: string;
    title: string;
    cover: string | null;
  }
): void {
  store.update((prev) => {
    const cur = prev[id];
    const read = Array.from(new Set([...(cur?.read ?? []), p.ch])).sort(
      (a, b) => a - b
    );
    return {
      ...prev,
      [id]: {
        ch: p.ch,
        chapterId: p.chapterId,
        page: p.page,
        pages: p.pages || cur?.pages || 0,
        total: p.total || cur?.total || 0,
        lang: p.lang || cur?.lang || 'en',
        read,
        title: p.title || cur?.title || '',
        cover: p.cover ?? cur?.cover ?? null,
        updatedAt: Date.now(),
      },
    };
  });
}

export function setPreferredLang(id: number, lang: string): void {
  store.update((prev) => {
    const cur = prev[id];
    if (!cur) return prev;
    return { ...prev, [id]: { ...cur, lang, updatedAt: Date.now() } };
  });
}

export function isChapterRead(id: number, ch: number): boolean {
  return store.get()[id]?.read.includes(ch) ?? false;
}

export function markChapterRead(id: number, ch: number): void {
  store.update((prev) => {
    const cur = prev[id];
    const read = Array.from(new Set([...(cur?.read ?? []), ch])).sort(
      (a, b) => a - b
    );
    return {
      ...prev,
      [id]: {
        ch: cur?.ch ?? ch,
        chapterId: cur?.chapterId ?? '',
        page: cur?.page ?? 0,
        pages: cur?.pages ?? 0,
        total: cur?.total ?? 0,
        lang: cur?.lang ?? 'en',
        read,
        title: cur?.title ?? '',
        cover: cur?.cover ?? null,
        updatedAt: Date.now(),
      },
    };
  });
}

// Mark a set of chapter numbers read at once (single tap, or "mark all up to
// here"). Unions with what's already read and lifts the resume pointer to the
// highest. Carries title/cover so the entry is complete in the Continue rail
// even when the user marks from the chapter list without opening the reader.
export function markChaptersRead(
  id: number,
  chs: number[],
  info?: {
    total?: number;
    lang?: string;
    title?: string;
    cover?: string | null;
  }
): void {
  if (!chs.length) return;
  store.update((prev) => {
    const cur = prev[id];
    const read = Array.from(new Set([...(cur?.read ?? []), ...chs])).sort(
      (a, b) => a - b
    );
    return {
      ...prev,
      [id]: {
        ch: Math.max(cur?.ch ?? 0, ...chs),
        chapterId: cur?.chapterId ?? '',
        page: cur?.page ?? 0,
        pages: cur?.pages ?? 0,
        total: info?.total || cur?.total || 0,
        lang: info?.lang || cur?.lang || 'en',
        read,
        title: info?.title || cur?.title || '',
        cover: info?.cover ?? cur?.cover ?? null,
        updatedAt: Date.now(),
      },
    };
  });
}

// Un-mark one chapter. The resume label ("Continue · Ch. N") can't stand ahead
// of what's still read, so pull `ch` back to the highest remaining read chapter.
export function unmarkChapterRead(id: number, ch: number): void {
  store.update((prev) => {
    const cur = prev[id];
    if (!cur) return prev;
    const read = cur.read.filter((c) => c !== ch);
    const maxRead = read.length ? Math.max(...read) : 0;
    return {
      ...prev,
      [id]: {
        ...cur,
        ch: Math.min(cur.ch, maxRead),
        read,
        updatedAt: Date.now(),
      },
    };
  });
}

// "Unmark from here": clear every read mark at or above `ch` (the inverse of
// "mark all up to here"), and pull the resume pointer back below it.
export function unmarkChaptersFrom(id: number, ch: number): void {
  store.update((prev) => {
    const cur = prev[id];
    if (!cur) return prev;
    const read = cur.read.filter((c) => c < ch);
    const maxRead = read.length ? Math.max(...read) : 0;
    return {
      ...prev,
      [id]: {
        ...cur,
        ch: Math.min(cur.ch, maxRead),
        read,
        updatedAt: Date.now(),
      },
    };
  });
}

export function removeMangaContinue(id: number): void {
  store.update((prev) => {
    if (!prev[id]) return prev;
    const next = { ...prev };
    delete next[id];
    return next;
  });
}

let lastMap: MangaProgressMap | undefined;
let lastList: MangaContinueItem[] = [];
export function listMangaContinue(): MangaContinueItem[] {
  const map = store.get();
  if (map === lastMap) return lastList;
  lastMap = map;
  lastList = Object.keys(map)
    .map((id) => ({ id: Number(id), entry: map[Number(id)] }))
    .filter(({ entry }) => {
      const finished = entry.total > 0 && entry.read.length >= entry.total;
      return !finished && (entry.read.length > 0 || entry.page > 0);
    })
    .sort((a, b) => b.entry.updatedAt - a.entry.updatedAt);
  return lastList;
}
