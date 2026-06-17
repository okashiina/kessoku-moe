import { LRUCache } from 'lru-cache';

// Short-TTL read cache for DB-backed endpoints; invalidate on write. Process
// memory (single Railway instance); Redis is the multi-replica upgrade. Kept
// generic so the upcoming per-episode-rating + comment reads reuse it.

const store = new LRUCache<string, unknown>({ max: 2000, ttl: 30_000 });

export const cacheGet = <T>(key: string): T | undefined =>
  store.get(key) as T | undefined;

export const cacheSet = <T>(key: string, value: T): void => {
  store.set(key, value as unknown);
};

export const cacheDel = (key: string): void => {
  store.delete(key);
};
