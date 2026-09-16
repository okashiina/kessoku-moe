import { authHeader, type AniListSession } from './anilistAuth';
import { isForeignManga, isKnownRemoteManga } from './anilistMangaSync';
import {
  getMangaProgressMap,
  mergeRemoteMangaPosition,
  type MangaProgressEntry,
  type RemoteMangaPosition,
} from './mangaProgress';

const ENDPOINT = '/api/manga/progress';
const MAX_COUNT = 1_000_000;
const remoteUpdated = new Map<number, number>();
let pulledForUser: number | null = null;
const pullListeners = new Set<() => void>();

const notifyPullState = (): void => {
  pullListeners.forEach((listener) => listener());
};

export const subscribeMangaPositionPull = (
  listener: () => void
): (() => void) => {
  pullListeners.add(listener);
  return () => pullListeners.delete(listener);
};

/** True only after this account's exact-position GET completed successfully. */
export const isMangaPositionPullReady = (userId: number): boolean =>
  pulledForUser === userId;

interface ApiPosition extends RemoteMangaPosition {
  anilistId: number;
}

const finiteInt = (value: unknown, min: number, max: number): number | null => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max
    ? number
    : null;
};

const parsePosition = (value: unknown): ApiPosition | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const anilistId = finiteInt(row.anilistId, 1, 2_147_483_647);
  const page = finiteInt(row.page, 0, MAX_COUNT);
  const pages = finiteInt(row.pages, 0, MAX_COUNT);
  const progressBps = finiteInt(row.progressBps, 0, 10000);
  const total = finiteInt(row.total, 0, MAX_COUNT);
  const updatedAt = Number(row.updatedAt);
  if (
    anilistId === null ||
    page === null ||
    pages === null ||
    progressBps === null ||
    total === null ||
    !Number.isFinite(updatedAt) ||
    (pages > 0 && page >= pages) ||
    typeof row.chapterId !== 'string' ||
    !row.chapterId ||
    typeof row.chapterNumber !== 'string' ||
    !row.chapterNumber ||
    typeof row.lang !== 'string' ||
    !row.lang ||
    typeof row.title !== 'string' ||
    !row.title ||
    (row.cover !== null && typeof row.cover !== 'string')
  )
    return null;
  return {
    anilistId,
    chapterId: row.chapterId,
    chapterNumber: row.chapterNumber,
    page,
    pages,
    progressBps,
    total,
    lang: row.lang,
    title: row.title,
    cover: row.cover as string | null,
    updatedAt,
  };
};

const resetFor = (userId: number): void => {
  if (pulledForUser === userId) return;
  const changed = pulledForUser !== null;
  pulledForUser = null;
  remoteUpdated.clear();
  if (changed) notifyPullState();
};

/**
 * Pull exact positions after AniList has authenticated and confirmed this
 * account's manga ids. A failed request changes nothing and keeps local-first
 * resume behaviour intact.
 */
export const pullMangaPositions = async (
  session: AniListSession
): Promise<boolean> => {
  resetFor(session.user.id);
  if (pulledForUser === session.user.id) return true;
  try {
    const response = await fetch(ENDPOINT, {
      headers: { Accept: 'application/json', ...authHeader(session.token) },
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { positions?: unknown };
    if (!Array.isArray(body.positions)) return false;
    // A successful empty list is an important baseline: it means local entries
    // may be sent after AniList has independently confirmed their ownership.
    body.positions.forEach((raw) => {
      const position = parsePosition(raw);
      if (!position || !isKnownRemoteManga(position.anilistId)) return;
      remoteUpdated.set(position.anilistId, position.updatedAt);
      mergeRemoteMangaPosition(position.anilistId, position);
    });
    pulledForUser = session.user.id;
    notifyPullState();
    return true;
  } catch {
    return false;
  }
};

const bpsFor = (entry: MangaProgressEntry): number => {
  if (
    typeof entry.progressBps === 'number' &&
    Number.isFinite(entry.progressBps)
  )
    return Math.max(0, Math.min(10000, Math.round(entry.progressBps)));
  if (entry.pages > 1)
    return Math.max(
      0,
      Math.min(10000, Math.round((entry.page / (entry.pages - 1)) * 10000))
    );
  return 0;
};

const bodyFor = (anilistId: number, entry: MangaProgressEntry) => {
  const pages = Math.max(0, Math.min(MAX_COUNT, Math.trunc(entry.pages) || 0));
  const rawPage = Math.max(0, Math.min(MAX_COUNT, Math.trunc(entry.page) || 0));
  return {
    anilistId,
    chapterId: entry.chapterId,
    chapterNumber: String(entry.ch),
    page: pages > 0 ? Math.min(rawPage, pages - 1) : rawPage,
    pages,
    progressBps: bpsFor(entry),
    total: Math.max(0, Math.min(MAX_COUNT, Math.trunc(entry.total) || 0)),
    lang: entry.lang || 'en',
    title: entry.title || 'Untitled',
    cover: entry.cover,
  };
};

/**
 * Push only after a successful exact pull, and only for manga AniList has
 * confirmed belongs to the selected account. The server timestamp returned by
 * PUT becomes the baseline, preventing subscription/remote-merge loops.
 */
export const pushMangaPositions = async (
  session: AniListSession
): Promise<void> => {
  if (pulledForUser !== session.user.id) return;
  const entries = getMangaProgressMap();
  // eslint-disable-next-line no-restricted-syntax
  for (const key of Object.keys(entries)) {
    const anilistId = Number(key);
    const entry = entries[anilistId];
    if (
      !Number.isFinite(anilistId) ||
      !entry?.chapterId ||
      !isKnownRemoteManga(anilistId) ||
      isForeignManga(anilistId)
    )
      // eslint-disable-next-line no-continue
      continue;
    const remoteAt = remoteUpdated.get(anilistId) ?? 0;
    // Local writes from before the successful pull are intentionally compared
    // with server time. This lets a newer local page win while a newer remote
    // page is merged down and left alone.
    // eslint-disable-next-line no-continue
    if (entry.updatedAt <= remoteAt) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(ENDPOINT, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...authHeader(session.token),
        },
        body: JSON.stringify(bodyFor(anilistId, entry)),
      });
      // eslint-disable-next-line no-continue
      if (!response.ok) continue;
      // eslint-disable-next-line no-await-in-loop
      const body = (await response.json()) as { position?: unknown };
      const position = parsePosition(body.position);
      // eslint-disable-next-line no-continue
      if (!position || position.anilistId !== anilistId) continue;
      // A client clock can be ahead of the server clock. Treat this successful
      // payload as acknowledged either way so it cannot be resent forever.
      remoteUpdated.set(
        anilistId,
        Math.max(position.updatedAt, entry.updatedAt)
      );
      // The server timestamp is the authoritative baseline. This merge is a
      // no-op for fields (same payload) except for recording its timestamp.
      mergeRemoteMangaPosition(anilistId, position);
    } catch {
      // Keep the older baseline so a later debounced sync can retry.
    }
  }
};
