import { useSyncExternalStore } from 'react';

import { createStore } from './externalStore';
import { addToWatchlist } from './watchlist';

// Per-title personal score, stored as AniList's scoreRaw (0-100 integer), the
// format-independent value. Local-first like listStatus: authoritative locally,
// synced to AniList where SaveMediaListEntry(scoreRaw) writes it and AniList
// renders it in each viewer's own score format. 0 / absent means "no score".

type ScoreMap = Record<number, number>; // mediaId -> scoreRaw 0..100
const KEY = 'kessoku.listscore.v1';
const store = createStore<ScoreMap>(KEY, {});
export const subscribeScore = store.subscribe;

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

/** The whole score map (for AniList sync diffing). Read-only. */
export const getScoreMap = (): Readonly<ScoreMap> => store.get();

/** scoreRaw 0-100 for a title, or 0 when unscored. */
export const getScore = (id: number): number => store.get()[id] ?? 0;

/** Set scoreRaw 0-100; 0 clears it. A score implies the title is on the list. */
export const setScore = (id: number, scoreRaw: number): void => {
  const v = clamp(scoreRaw);
  if (v > 0) addToWatchlist(id);
  store.update((prev) => {
    if ((prev[id] ?? 0) === v) return prev;
    const next = { ...prev };
    if (v > 0) next[id] = v;
    else delete next[id];
    return next;
  });
};

export const clearScore = (id: number): void => setScore(id, 0);

// Reactive scoreRaw for one title. Returns a primitive so the snapshot is stable
// across renders (no "getSnapshot should be cached" loop); SSR resolves to 0.
export const useScore = (id: number): number =>
  useSyncExternalStore(
    store.subscribe,
    () => store.get()[id] ?? 0,
    () => 0
  );
