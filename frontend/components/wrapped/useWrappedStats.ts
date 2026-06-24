import { useSyncExternalStore } from 'react';

// Reading/Watching Wrapped stats, computed ENTIRELY from local stores (no
// backend, no AniList). Every store here already returns a referentially-stable
// snapshot (see utility/externalStore.ts), so we can subscribe to each and let
// React recompute only when one actually changes. SSR resolves every store to
// its empty fallback, so the server renders the empty state and the client
// hydrates the real numbers.

import {
  effectiveStatus,
  getStatusMap,
  subscribeStatus,
} from '@utility/listStatus';
import { listSavedManga, subscribeMangaList } from '@utility/mangaList';
import {
  listMangaContinue,
  subscribeMangaProgress,
} from '@utility/mangaProgress';
import { listContinue, subscribeProgress } from '@utility/progress';
import { listWatchlistIds, subscribeWatchlist } from '@utility/watchlist';

export interface Highlight {
  id: number;
  title: string;
  cover: string | null;
  count: number; // chapters read / episodes watched
  kind: 'manga' | 'anime';
}

export interface WrappedStats {
  ready: boolean; // true once mounted on the client
  hasData: boolean;
  chaptersRead: number;
  episodesWatched: number;
  mangaSeries: number; // distinct manga touched (read or listed)
  animeSeries: number; // distinct anime touched (watched or listed)
  mangaStatus: { reading: number; completed: number; plan: number };
  animeStatus: { watching: number; completed: number; planning: number };
  streakDays: number; // consecutive active days ending today/yesterday (0 = none)
  topManga: Highlight | null;
  topAnime: Highlight | null;
}

const EMPTY: WrappedStats = {
  ready: false,
  hasData: false,
  chaptersRead: 0,
  episodesWatched: 0,
  mangaSeries: 0,
  animeSeries: 0,
  mangaStatus: { reading: 0, completed: 0, plan: 0 },
  animeStatus: { watching: 0, completed: 0, planning: 0 },
  streakDays: 0,
  topManga: null,
  topAnime: null,
};

const DAY = 86_400_000;

// Longest run of consecutive calendar days with at least one timestamp, counting
// back from today (an active streak only "counts" if today or yesterday is in
// it; otherwise it has lapsed and we report 0).
function computeStreak(timestamps: number[]): number {
  if (!timestamps.length) return 0;
  const days = new Set(
    timestamps.map((t) => Math.floor(t / DAY)) // day index, local-ish (UTC days)
  );
  const today = Math.floor(Date.now() / DAY);
  if (!days.has(today) && !days.has(today - 1)) return 0;
  let cursor = days.has(today) ? today : today - 1;
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }
  return streak;
}

// Subscribe once to all five stores; any change in any of them re-renders.
const subscribeAll = (cb: () => void): (() => void) => {
  const unsubs = [
    subscribeMangaProgress(cb),
    subscribeMangaList(cb),
    subscribeProgress(cb),
    subscribeWatchlist(cb),
    subscribeStatus(cb),
  ];
  return () => unsubs.forEach((u) => u());
};

// The five raw snapshots, each referentially stable. We key the heavy compute
// off their identities so it only re-runs when a store actually mutates.
let lastDeps: unknown[] = [];
let lastStats: WrappedStats = EMPTY;

function getSnapshot(): WrappedStats {
  const mangaReading = listMangaContinue();
  const savedManga = listSavedManga();
  const animeWatching = listContinue();
  const watchlistIds = listWatchlistIds();
  const statusMap = getStatusMap();

  const deps = [
    mangaReading,
    savedManga,
    animeWatching,
    watchlistIds,
    statusMap,
  ];
  const unchanged =
    deps.length === lastDeps.length && deps.every((d, i) => d === lastDeps[i]);
  if (unchanged && lastStats.ready) return lastStats;
  lastDeps = deps;

  // ---- Manga: chapters read + most-read, from full progress entries ----
  let chaptersRead = 0;
  let topManga: Highlight | null = null;
  const mangaIds = new Set<number>();
  const activity: number[] = [];

  mangaReading.forEach(({ id, entry }) => {
    mangaIds.add(id);
    chaptersRead += entry.read.length;
    activity.push(entry.updatedAt);
    if (!topManga || entry.read.length > topManga.count) {
      topManga = {
        id,
        title: entry.title || 'Untitled',
        cover: entry.cover,
        count: entry.read.length,
        kind: 'manga',
      };
    }
  });
  savedManga.forEach((m) => {
    mangaIds.add(m.id);
    activity.push(m.addedAt);
  });

  // mangaReading drops finished series (read >= total), so completed titles with
  // a full read-count are only in savedManga. Their chapters are already on the
  // list status, not re-counted here; "chapters read" reflects in-progress reads,
  // which is the honest local number we can derive without re-fetching counts.

  const mangaStatus = { reading: 0, completed: 0, plan: 0 };
  savedManga.forEach((m) => {
    if (m.status === 'READING') mangaStatus.reading += 1;
    else if (m.status === 'COMPLETED') mangaStatus.completed += 1;
    else if (m.status === 'PLAN_TO_READ') mangaStatus.plan += 1;
  });

  // ---- Anime: episodes watched + most-watched, from full progress entries ----
  let episodesWatched = 0;
  let topAnime: Highlight | null = null;
  const animeIds = new Set<number>();

  animeWatching.forEach(({ id, entry }) => {
    animeIds.add(id);
    episodesWatched += entry.watched.length;
    activity.push(entry.updatedAt);
    if (!topAnime || entry.watched.length > topAnime.count) {
      // Anime progress entries don't cache a title/cover (unlike manga), so the
      // headliner shows the id-linked tile; the card links into /anime/[id].
      topAnime = {
        id,
        title: '',
        cover: null,
        count: entry.watched.length,
        kind: 'anime',
      };
    }
  });
  watchlistIds.forEach((id) => animeIds.add(id));

  const animeStatus = { watching: 0, completed: 0, planning: 0 };
  watchlistIds.forEach((id) => {
    const s = effectiveStatus(id);
    if (s === 'CURRENT' || s === 'REPEATING') animeStatus.watching += 1;
    else if (s === 'COMPLETED') animeStatus.completed += 1;
    else if (s === 'PLANNING') animeStatus.planning += 1;
  });

  const streakDays = computeStreak(activity);

  const hasData =
    chaptersRead > 0 ||
    episodesWatched > 0 ||
    mangaIds.size > 0 ||
    animeIds.size > 0;

  lastStats = {
    ready: true,
    hasData,
    chaptersRead,
    episodesWatched,
    mangaSeries: mangaIds.size,
    animeSeries: animeIds.size,
    mangaStatus,
    animeStatus,
    streakDays,
    topManga,
    topAnime,
  };
  return lastStats;
}

// Stable server snapshot: the empty shell renders on the server, real numbers
// hydrate on the client.
const getServerSnapshot = (): WrappedStats => EMPTY;

export const useWrappedStats = (): WrappedStats =>
  useSyncExternalStore(subscribeAll, getSnapshot, getServerSnapshot);
