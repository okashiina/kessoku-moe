import { useSyncExternalStore } from 'react';

import type { CompanionCard } from '@utility/companion/types';
import { createStore } from '@utility/externalStore';

// Persistent chat thread for the manga Reading Companion, keyed per
// `${mangaKey}:${chapter}` so each chapter keeps its own conversation across
// reloads. Mirrors utility/companionThread.ts (the anime watch companion) but
// stored LOCAL-ONLY (this localStorage map, never the server): the snapshot is
// referentially stable for useSyncExternalStore, cross-tab edits invalidate the
// cache, and SSR always returns the same empty reference. Capped to the
// most-recently-touched ~10 chapters so localStorage never grows without bound.

export interface ThreadMessage {
  role: 'user' | 'assistant';
  content: string;
  // Entity cards (character) the companion surfaced for this reply, persisted so
  // they render on reload without re-fetching AniList. Optional + additive, so a
  // v1 thread already in localStorage still parses.
  cards?: CompanionCard[];
}

interface ThreadEntry {
  messages: ThreadMessage[];
  updatedAt: number;
}

type ThreadMap = Record<string, ThreadEntry>;

const KEY = 'kessoku.manga.companion.thread.v1';
const MAX_THREADS = 10;
const emptyMap: ThreadMap = {};

const store = createStore<ThreadMap>(KEY, emptyMap);

// A single frozen empty array reused for every "no thread yet" read, so the
// server snapshot and unseeded client reads return a STABLE reference and never
// trip React's "getSnapshot should be cached" warning/loop.
const EMPTY: ThreadMessage[] = [];

// Stable per-chapter key. AniList ids are unique across the catalogue; fall back
// to a slug of the title when a title has no AniList id so it still persists.
export const mangaThreadKey = (
  anilistId: number | null,
  title: string,
  chapter: number
): string => {
  const base =
    anilistId != null
      ? String(anilistId)
      : `t:${title.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}`;
  return `${base}:${chapter}`;
};

// Per-key cache of the last messages array handed out: as long as the underlying
// map entry is the same object, return the same array reference so
// useSyncExternalStore stays happy across re-renders.
let mapCache: ThreadMap | null = null;
const msgCache: Record<string, ThreadMessage[]> = {};

const snapshotFor = (k: string): ThreadMessage[] => {
  const map = store.get();
  if (map !== mapCache) {
    mapCache = map;
    Object.keys(msgCache).forEach((mk) => delete msgCache[mk]);
  }
  const entry = map[k];
  if (!entry || entry.messages.length === 0) return EMPTY;
  if (!msgCache[k]) msgCache[k] = entry.messages;
  return msgCache[k];
};

export const getMangaThread = (k: string): ThreadMessage[] => snapshotFor(k);

// Write one chapter's thread, then prune to the MAX_THREADS most-recently-updated
// keys so storage stays bounded.
export const setMangaThread = (k: string, msgs: ThreadMessage[]): void => {
  store.update((prev) => {
    const next: ThreadMap = { ...prev };
    next[k] = { messages: msgs, updatedAt: Date.now() };
    const keys = Object.keys(next);
    if (keys.length > MAX_THREADS) {
      keys
        .sort((a, b) => next[b].updatedAt - next[a].updatedAt)
        .slice(MAX_THREADS)
        .forEach((stale) => {
          delete next[stale];
        });
    }
    return next;
  });
};

export const appendMangaMessage = (k: string, msg: ThreadMessage): void => {
  setMangaThread(k, getMangaThread(k).concat(msg));
};

export const useMangaThread = (k: string): ThreadMessage[] =>
  useSyncExternalStore(
    store.subscribe,
    () => snapshotFor(k),
    () => EMPTY
  );
