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
export const DOWNLOAD_NEXT_MAX = 3; // "Download next N" ceiling

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

// --- Persistent storage ---------------------------------------------------
// Ask the browser to mark this origin's storage as persistent so iOS/Android are
// less likely to evict our downloaded chapters under storage pressure. Both calls
// are best-effort and feature-gated: if the API is missing (older Safari, private
// mode) we just report 'unsupported' and never throw.
export type PersistState = 'persistent' | 'best-effort' | 'unsupported';

function storageApi(): StorageManager | undefined {
  if (!hasWindow) return undefined;
  const nav = navigator as Navigator & { storage?: StorageManager };
  return nav.storage;
}

// Best-effort: request persistence. Safe to call repeatedly (idempotent in the
// browser). Returns the resulting state. Never rejects.
export async function ensurePersistentStorage(): Promise<PersistState> {
  const api = storageApi();
  if (!api?.persist || !api?.persisted) return 'unsupported';
  try {
    if (await api.persisted()) return 'persistent';
    const granted = await api.persist();
    return granted ? 'persistent' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}

// Read-only: current persistence state without requesting it.
export async function getPersistState(): Promise<PersistState> {
  const api = storageApi();
  if (!api?.persisted) return 'unsupported';
  try {
    return (await api.persisted()) ? 'persistent' : 'best-effort';
  } catch {
    return 'unsupported';
  }
}

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

// Referentially-stable snapshot for useSyncExternalStore: returns the same array
// reference until the localStorage index actually changes, so the hook doesn't
// loop ("getSnapshot should be cached"). Mirrors the lastMap/lastList trick in
// mangaList.ts.
let lastRaw: string | null = null;
let lastList: DownloadMeta[] = [];
export const DOWNLOADS_EMPTY: DownloadMeta[] = [];
export function downloadsSnapshot(): DownloadMeta[] {
  if (!hasWindow) return DOWNLOADS_EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(INDEX_KEY);
  } catch {
    raw = null;
  }
  if (raw === lastRaw) return lastList;
  lastRaw = raw;
  lastList = listDownloads();
  return lastList;
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

// Delete every downloaded chapter (cache bytes + index). Used by the Downloads
// manager's "Clear all". Deletes are sequenced so the loop carries no closure
// over a mutated cache handle (no-loop-func / no for...of).
export async function clearAll(): Promise<void> {
  const ids = Object.keys(readIndex());
  await ids.reduce<Promise<void>>(
    (chain, id) => chain.then(() => deleteChapter(id)),
    Promise.resolve()
  );
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

  // Best-effort: ask for persistent storage so this download is less evictable.
  // Fire-and-forget; never blocks or fails the download.
  ensurePersistentStorage().catch(() => {});

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

// --- Multi-chapter ("Download next N") ------------------------------------
// Fetch a chapter's proxied page URLs for the chosen quality tier. Mirrors what
// the reader does, so callers can download a chapter they're NOT currently
// viewing. Returns [] on any failure (caller treats that as "skip this one").
async function fetchPageUrls(
  chapterId: string,
  dataSaver: boolean
): Promise<string[]> {
  try {
    const res = await fetch(pagesUrl(chapterId));
    if (!res.ok) return [];
    const json = (await res.json()) as {
      pages?: string[];
      pagesDataSaver?: string[];
    };
    const list = dataSaver ? json.pagesDataSaver : json.pages;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export interface NextChapter {
  id: string;
  title?: string;
}

export interface DownloadNextProgress {
  index: number; // 1-based: which chapter of the batch we're on
  count: number; // how many chapters we're attempting
  done: number; // pages cached in the current chapter
  total: number; // pages in the current chapter
  title?: string;
}

// Download an explicit, ordered list of chapters (already-downloaded ones are
// skipped). Sequential and rate-friendly: one chapter at a time, each chapter's
// own image batching stays inside downloadChapter. Best-effort — a chapter whose
// pages can't be fetched or cached is skipped, not fatal. Returns how many of the
// attempted chapters ended up saved.
export async function downloadNext(
  chapters: NextChapter[],
  dataSaver: boolean,
  onProgress?: (p: DownloadNextProgress) => void
): Promise<{ saved: number; attempted: number }> {
  const pending = chapters.filter((c) => !isChapterDownloaded(c.id));
  const count = pending.length;
  if (!hasCaches || count === 0) return { saved: 0, attempted: 0 };

  ensurePersistentStorage().catch(() => {});

  // Sequence with reduce so the loop carries no closure over mutated state
  // (no-loop-func / no for...of). Each step resolves to the running saved count.
  const result = await pending.reduce<Promise<number>>(
    (chain, chapter, i) =>
      chain.then(async (saved) => {
        const urls = await fetchPageUrls(chapter.id, dataSaver);
        if (urls.length === 0) {
          onProgress?.({
            index: i + 1,
            count,
            done: 0,
            total: 0,
            title: chapter.title,
          });
          return saved;
        }
        const r = await downloadChapter(
          chapter.id,
          urls,
          { title: chapter.title },
          (done, total) =>
            onProgress?.({
              index: i + 1,
              count,
              done,
              total,
              title: chapter.title,
            })
        );
        return r.ok ? saved + 1 : saved;
      }),
    Promise.resolve(0)
  );

  return { saved: result, attempted: count };
}
