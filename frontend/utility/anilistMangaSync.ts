import { authHeader, type AniListSession } from './anilistAuth';
import { getAniListWrite } from './anilistWrite';
import { getMangaEntry, type MangaProgressEntry } from './mangaProgress';

// One-way AniList sync for manga READING PROGRESS — the manga twin of
// anilistSync.ts (anime). When the user marks chapters read locally, the
// chapter count is pushed up to their AniList list as a MANGA entry.
//
// ponytail: PUSH-only mirror. Unlike the anime sync this does NOT pull, manage
// status/score, handle deletes, or carry tombstone/dirty intent — a sibling
// feature owns local manga status. AniList stays a one-way mirror of progress
// for now (local → remote only). Upgrade path: add a pullMangaProgress() that
// runs LIST_Q and merges remote progress/status into mangaProgress, mirroring
// anilistSync.pullAndMerge, plus the persisted intent layer if two-way edits
// are ever needed. For now a single localStorage Map of last-pushed progress is
// enough to avoid redundant writes.
//
// We DO send status (CURRENT / COMPLETED) alongside progress because AniList
// expects a status and it materially improves the list UX — but only the two
// progress-implied states, never PAUSED / DROPPED / REPEATING (those belong to
// whatever owns local status, not here).

const ENDPOINT = 'https://graphql.anilist.co';

type MangaStatus = 'CURRENT' | 'COMPLETED';

// Pull query kept for the optional future pull (see ponytail note above). Unused
// today; type: MANGA is the one difference from the anime LIST_Q.
export const LIST_Q = /* GraphQL */ `
  query ($userId: Int!) {
    MediaListCollection(userId: $userId, type: MANGA) {
      hasNextChunk
      lists {
        entries {
          id
          mediaId
          status
          progress
          media {
            chapters
          }
        }
      }
    }
  }
`;

const SAVE_M = /* GraphQL */ `
  mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int) {
    SaveMediaListEntry(
      mediaId: $mediaId
      status: $status
      progress: $progress
    ) {
      id
      mediaId
    }
  }
`;

interface GqlResult<T> {
  data?: T;
  errors?: unknown;
}

// Same fetch + auth pattern as anilistSync.ts. AniList may rate-limit (429);
// like the anime sync this is best-effort — a failed call just leaves the
// baseline unchanged so the next debounce retries.
const gql = async <T>(
  query: string,
  variables: Record<string, unknown>,
  token?: string
): Promise<T | null> => {
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? authHeader(token) : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = (await res.json()) as GqlResult<T>;
    return json?.data ?? null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Baseline: last progress we pushed per mediaId, persisted so a refresh doesn't
// re-push everything. ponytail: a plain Map mirrored to localStorage, no diff
// engine — we only push when local progress is strictly AHEAD of this baseline.
// ---------------------------------------------------------------------------

const BASELINE_KEY = 'kessoku.anilist.mangaSync.v1';
const lastPushed = new Map<number, number>();
let baselineLoaded = false;

const loadBaseline = (): void => {
  if (baselineLoaded || typeof window === 'undefined') return;
  baselineLoaded = true;
  try {
    const raw = window.localStorage.getItem(BASELINE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      Object.keys(parsed).forEach((k) => {
        const n = Number(parsed[k]);
        if (Number.isFinite(n)) lastPushed.set(Number(k), n);
      });
    }
  } catch {
    /* ignore a corrupt blob */
  }
};

const saveBaseline = (): void => {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<number, number> = {};
    lastPushed.forEach((v, k) => {
      obj[k] = v;
    });
    window.localStorage.setItem(BASELINE_KEY, JSON.stringify(obj));
  } catch {
    /* ignore quota / private-mode failures */
  }
};

/** AniList "progress" = chapters read. Highest read chapter, else the pointer. */
const aniListMangaProgress = (e?: MangaProgressEntry): number => {
  if (!e) return 0;
  // read[] holds chapter numbers marked read; chapters can be decimals (12.5),
  // but AniList progress is an integer count, so floor the highest.
  const maxRead = e.read.length ? Math.max(...e.read) : 0;
  return Math.floor(Math.max(maxRead, e.ch || 0));
};

const mangaStatus = (progress: number, total: number): MangaStatus =>
  total > 0 && progress >= total ? 'COMPLETED' : 'CURRENT';

/**
 * Seed the baseline on mount. ponytail: we only load the persisted last-pushed
 * map — there's no remote pull, so "baseline" is purely the local push history.
 */
export const initMangaBaseline = (): void => {
  loadBaseline();
};

/**
 * Push any local manga progress that is ahead of what we last sent. No-op when
 * logged out or when AniList writing is disabled (mirrors the anime sync: local
 * progress is still recorded by the reader, so flipping write back on flushes it
 * on the next change). Best-effort: a failed save leaves the baseline so it
 * retries.
 */
export const pushMangaChanges = async (
  session: AniListSession
): Promise<void> => {
  if (!getAniListWrite()) return;
  loadBaseline();
  const { token } = session;

  // Only ids the reader has touched are candidates. ponytail: we don't keep a
  // separate id index — mangaProgress is the source, so read every id off it via
  // its localStorage map. Reusing getMangaEntry keeps the import surface tiny.
  let ids: number[] = [];
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('kessoku.mangaProgress.v1');
      if (raw) {
        const map = JSON.parse(raw) as Record<string, unknown>;
        ids = Object.keys(map).map(Number);
      }
    } catch {
      /* ignore */
    }
  }
  if (!ids.length) return;

  let changed = false;
  // eslint-disable-next-line no-restricted-syntax
  for (const id of ids) {
    const entry = getMangaEntry(id);
    const progress = aniListMangaProgress(entry);
    const baseline = lastPushed.get(id) ?? 0;
    // Push only when local progress is strictly ahead of the last push. ponytail:
    // never lowers progress (no rewind path on the manga side yet).
    // eslint-disable-next-line no-continue
    if (progress <= 0 || progress <= baseline) continue;

    const total = entry?.total ?? 0;
    // eslint-disable-next-line no-await-in-loop
    const res = await gql<{
      SaveMediaListEntry?: { id: number; mediaId: number };
    }>(
      SAVE_M,
      { mediaId: id, status: mangaStatus(progress, total), progress },
      token
    );
    const saved = res?.SaveMediaListEntry;
    if (saved?.id && saved.mediaId) {
      lastPushed.set(id, progress);
      changed = true;
    }
    // On failure: leave the baseline so the next debounce retries this id.
  }

  if (changed) saveBaseline();
};
