// Offline manga downloads.
//
// Bytes live in the Cache Storage API (cache name `offline-manga-v1`, separate
// from Workbox's own caches). A small index of WHAT is downloaded lives in
// localStorage so the UI can read state synchronously (Cache Storage is async
// and can't drive a useSyncExternalStore snapshot).
//
// The page does ALL the downloading; the service worker only SERVES from this
// cache (see frontend/worker/index.ts). Same-origin Cache Storage is shared
// between page and SW, so a chapter cached here is later served offline.
//
// ponytail: localStorage index + Cache Storage bytes (no IndexedDB). Images are
// fetched in batches of 4 concurrent (MangaDex is ~5 req/s); a failed image is
// skipped (partial = true) instead of aborting the whole chapter.

const CACHE_NAME = 'offline-manga-v1';
const INDEX_KEY = 'kessoku.mangaDownloads.v1';
const EVENT = 'kessoku:manga-downloads';
const BATCH = 4; // ponytail: concurrent image fetches per batch

export interface DownloadMeta {
  chapterId: string;
  title?: string;
  pageCount: number;
  savedAt: number;
  partial?: boolean;
  // Exact URLs we cached, so deleteChapter can remove precisely.
  urls: string[];
}

type Index = Record<string, DownloadMeta>;

const hasWindow = typeof window !== 'undefined';
const hasCaches = hasWindow && typeof caches !== 'undefined';

function readIndex(): Index {
  if (!hasWindow) return {};
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as Index) : {};
  } catch {
    return {};
  }
}

function writeIndex(index: Index): void {
  if (!hasWindow) return;
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // Quota / private mode — non-fatal; bytes may still be cached.
  }
  window.dispatchEvent(new Event(EVENT));
}

function pagesUrl(chapterId: string): string {
  return `/api/manga/chapter/${chapterId}/pages`;
}

export function listDownloads(): DownloadMeta[] {
  return Object.values(readIndex()).sort((a, b) => b.savedAt - a.savedAt);
}

export function isChapterDownloaded(chapterId: string): boolean {
  return Boolean(readIndex()[chapterId]);
}

export function getDownload(chapterId: string): DownloadMeta | null {
  return readIndex()[chapterId] ?? null;
}

// useSyncExternalStore plumbing so the reader button is reactive.
export function subscribeDownloads(cb: () => void): () => void {
  if (!hasWindow) return () => undefined;
  const onStorage = (e: StorageEvent) => {
    if (e.key === INDEX_KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onStorage); // cross-tab
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', onStorage);
  };
}

export async function deleteChapter(chapterId: string): Promise<void> {
  const index = readIndex();
  const meta = index[chapterId];
  if (hasCaches) {
    try {
      const cache = await caches.open(CACHE_NAME);
      const urls = meta?.urls ?? [pagesUrl(chapterId)];
      await Promise.all(urls.map((u) => cache.delete(u).catch(() => false)));
    } catch {
      // Ignore cache errors — still drop the index entry below.
    }
  }
  delete index[chapterId];
  writeIndex(index);
}

export interface DownloadResult {
  ok: boolean;
  partial: boolean;
  done: number;
  total: number;
}

// Download a chapter for offline reading.
// `pageUrls` are the already-proxied <img src> entries currently in the reader
// (so data-saver is respected by passing whichever `pages` array is active).
export async function downloadChapter(
  chapterId: string,
  pageUrls: string[],
  meta?: { title?: string },
  onProgress?: (done: number, total: number) => void
): Promise<DownloadResult> {
  const total = pageUrls.length;
  if (!hasCaches || total === 0) {
    return { ok: false, partial: false, done: 0, total };
  }

  const cache = await caches.open(CACHE_NAME);

  // Cache the pages-JSON so the reader can load the page list offline too.
  try {
    await cache.add(pagesUrl(chapterId));
  } catch {
    // If the JSON can't be cached the chapter can't be reopened offline.
    return { ok: false, partial: false, done: 0, total };
  }

  const cached: string[] = [pagesUrl(chapterId)];
  let done = 0;
  let partial = false;

  // Cache one page; return the outcome instead of mutating outer state, so the
  // batch loop carries no closure over the loop-mutated counters (no-loop-func).
  const addOne = async (url: string): Promise<{ ok: boolean; url: string }> => {
    try {
      await cache.add(url);
      return { ok: true, url };
    } catch {
      return { ok: false, url };
    }
  };

  // ponytail: sequential batches of BATCH concurrent fetches (rate-friendly).
  for (let i = 0; i < pageUrls.length; i += BATCH) {
    const batch = pageUrls.slice(i, i + BATCH);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.all(batch.map(addOne));
    for (let j = 0; j < results.length; j += 1) {
      if (results[j].ok) cached.push(results[j].url);
      else partial = true;
      done += 1;
      onProgress?.(done, total);
    }
  }

  const index = readIndex();
  index[chapterId] = {
    chapterId,
    title: meta?.title,
    pageCount: total,
    savedAt: Date.now(),
    partial,
    urls: cached,
  };
  writeIndex(index);

  return { ok: true, partial, done, total };
}
