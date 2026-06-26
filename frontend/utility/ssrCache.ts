// Tiny in-memory TTL cache for server-side (getServerSideProps) data fetches.
//
// The manga pages SSR-fetch the same AniList / MangaDex / scraper data on every
// navigation. On localhost that runs from a residential IP and feels instant; on
// the Railway deploy it runs from a datacenter IP where those round-trips are slow
// and often rate-limited, so the page transition stalled for seconds (Next.js holds
// the navigation until getServerSideProps resolves). Memoizing the successful
// lookups in-process makes revisits — and chapter-to-chapter reading in the same
// series — near-instant, because the heavy fetch only happens once per TTL.
//
// The Railway app is a long-lived Node server (not serverless), so this module-scope
// Map persists across requests. Per-instance only; that's fine for a personal-scale
// read cache. We cache only SUCCESSFUL, non-empty results, so a transient timeout or
// network error never poisons the cache for the whole TTL — the next request retries.

interface Entry {
  value: unknown;
  exp: number;
}

const store = new Map<string, Entry>();
const MAX_ENTRIES = 500;

const isEmpty = (v: unknown): boolean =>
  v == null ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v as object).length === 0);

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.exp > now) return hit.value as T;

  const value = await fn();

  // Only cache a real result; let failures/empties retry next time.
  if (!isEmpty(value)) {
    store.set(key, { value, exp: now + ttlMs });
    if (store.size > MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest !== undefined) store.delete(oldest);
    }
  }
  return value;
}
