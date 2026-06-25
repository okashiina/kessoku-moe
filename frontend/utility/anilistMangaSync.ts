import { authHeader, type AniListSession } from './anilistAuth';
import { getAniListWrite } from './anilistWrite';
import {
  getMangaStatus,
  getMangaScore,
  listSavedManga,
  type MangaStatus as ShelfStatus,
} from './mangaList';
import { getMangaEntry, type MangaProgressEntry } from './mangaProgress';

// One-way AniList sync for the manga shelf — the manga twin of anilistSync.ts
// (anime). Pushes, local → remote:
//   • READING PROGRESS — chapters read (from mangaProgress), and
//   • SHELF STATUS + SCORE — the local READING/COMPLETED/PLAN_TO_READ status and
//     personal score (scoreRaw 0-100) the user set on the shelf (from mangaList).
//
// ponytail: still PUSH-only (no pull, no deletes, no tombstone/dirty intent). We
// mirror local intent up; we never read AniList back or fight a value the user
// set there directly — two independent localStorage baselines (last-pushed
// progress, and last-pushed status+score) gate writes so we only call when a
// LOCAL value actually changed. Upgrade path: add a pullMangaProgress() that runs
// LIST_Q and merges remote state down, mirroring anilistSync.pullAndMerge, plus a
// persisted intent layer if two-way edits are ever needed.
//
// Status we send is the shelf's local status mapped to AniList
// (READING→CURRENT, PLAN_TO_READ→PLANNING, COMPLETED→COMPLETED); when there's no
// shelf status we fall back to the progress-implied state (CURRENT, or COMPLETED
// once progress reaches the chapter total). We NEVER send DROPPED / PAUSED /
// REPEATING — we don't model those locally — and clearing a local status does not
// delete the AniList entry (out of scope).

const ENDPOINT = 'https://graphql.anilist.co';

type MangaStatus = 'CURRENT' | 'COMPLETED' | 'PLANNING';

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
          score
          media {
            chapters
          }
        }
      }
    }
  }
`;

const SAVE_M = /* GraphQL */ `
  mutation (
    $mediaId: Int
    $status: MediaListStatus
    $progress: Int
    $scoreRaw: Int
  ) {
    SaveMediaListEntry(
      mediaId: $mediaId
      status: $status
      progress: $progress
      scoreRaw: $scoreRaw
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

// Map the local shelf status to AniList's MediaListStatus. Only the three states
// we model locally — never DROPPED / PAUSED / REPEATING.
const STATUS_MAP: Record<ShelfStatus, MangaStatus> = {
  READING: 'CURRENT',
  COMPLETED: 'COMPLETED',
  PLAN_TO_READ: 'PLANNING',
};

// ---------------------------------------------------------------------------
// Baselines: the last values we pushed per mediaId, persisted so a refresh
// doesn't re-push everything. ponytail: plain Maps mirrored to localStorage, no
// diff engine — progress only pushes when strictly AHEAD; status/score push when
// the local value DIFFERS from what we last sent (so we don't fight a value the
// user changed on AniList itself, and never spam identical writes).
// ---------------------------------------------------------------------------

const BASELINE_KEY = 'kessoku.anilist.mangaSync.v1';
const SHELF_BASELINE_KEY = 'kessoku.anilist.mangaShelfSync.v1';
const lastPushed = new Map<number, number>();
// Last status+score we sent per mediaId. status '' = none sent yet; score is the
// scoreRaw we last pushed (0 = none/unscored).
interface ShelfBaseline {
  status: MangaStatus | '';
  score: number;
}
const lastShelf = new Map<number, ShelfBaseline>();
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
  try {
    const raw = window.localStorage.getItem(SHELF_BASELINE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, ShelfBaseline>;
      Object.keys(parsed).forEach((k) => {
        const v = parsed[k];
        if (v && typeof v === 'object') {
          lastShelf.set(Number(k), {
            status: v.status ?? '',
            score: Number(v.score) || 0,
          });
        }
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
  try {
    const obj: Record<number, ShelfBaseline> = {};
    lastShelf.forEach((v, k) => {
      obj[k] = v;
    });
    window.localStorage.setItem(SHELF_BASELINE_KEY, JSON.stringify(obj));
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

const progressStatus = (progress: number, total: number): MangaStatus =>
  total > 0 && progress >= total ? 'COMPLETED' : 'CURRENT';

/**
 * Seed the baselines on mount. ponytail: we only load the persisted last-pushed
 * maps — there's no remote pull, so "baseline" is purely the local push history.
 */
export const initMangaBaseline = (): void => {
  loadBaseline();
};

/**
 * Push any local manga changes (progress, shelf status, score) that differ from
 * what we last sent. No-op when logged out or when AniList writing is disabled
 * (local intent is still recorded by the reader / shelf, so flipping write back
 * on flushes it on the next change). Best-effort: a failed save leaves the
 * baseline so it retries.
 */
export const pushMangaChanges = async (
  session: AniListSession
): Promise<void> => {
  if (!getAniListWrite()) return;
  loadBaseline();
  const { token } = session;

  // Candidate ids = everything the reader has touched (mangaProgress) ∪
  // everything on the shelf (mangaList). ponytail: no separate id index — read
  // both source maps directly and union their keys.
  const ids = new Set<number>();
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('kessoku.mangaProgress.v1');
      if (raw) {
        const map = JSON.parse(raw) as Record<string, unknown>;
        Object.keys(map).forEach((k) => ids.add(Number(k)));
      }
    } catch {
      /* ignore */
    }
  }
  listSavedManga().forEach((m) => ids.add(m.id));
  if (!ids.size) return;

  let changed = false;
  // ponytail: a sequential await loop (no concurrency) so we stay one request at
  // a time — the existing best-effort throttle. eslint forbids for...of here.
  const idList = Array.from(ids);
  // eslint-disable-next-line no-restricted-syntax
  for (const id of idList) {
    const entry = getMangaEntry(id);
    const progress = aniListMangaProgress(entry);
    const progressBase = lastPushed.get(id) ?? 0;
    // Push progress only when strictly ahead of the last push. ponytail: never
    // lowers progress (no rewind path on the manga side yet).
    const sendProgress = progress > 0 && progress > progressBase;

    const shelfStatus = getMangaStatus(id);
    const shelfScore = getMangaScore(id);
    const base = lastShelf.get(id) ?? { status: '', score: 0 };

    // Status precedence: an explicit shelf status wins; otherwise, only when we
    // are sending progress, fall back to the progress-implied state so a brand
    // new entry still lands with a sensible status. ponytail: clearing the shelf
    // status does NOT push DROPPED/none — we just stop asserting a status.
    let status: MangaStatus | undefined;
    if (shelfStatus) status = STATUS_MAP[shelfStatus];
    else if (sendProgress) status = progressStatus(progress, entry?.total ?? 0);

    const sendStatus = status !== undefined && status !== base.status;
    const sendScore = shelfScore > 0 && shelfScore !== base.score;

    // eslint-disable-next-line no-continue
    if (!sendProgress && !sendStatus && !sendScore) continue;

    // One SaveMediaListEntry carries every changed field for this id.
    const variables: Record<string, unknown> = { mediaId: id };
    if (sendProgress) variables.progress = progress;
    if (sendStatus) variables.status = status;
    if (sendScore) variables.scoreRaw = shelfScore;

    // eslint-disable-next-line no-await-in-loop
    const res = await gql<{
      SaveMediaListEntry?: { id: number; mediaId: number };
    }>(SAVE_M, variables, token);
    const saved = res?.SaveMediaListEntry;
    if (saved?.id && saved.mediaId) {
      if (sendProgress) lastPushed.set(id, progress);
      // Record the status/score we just asserted. Keep prior baseline values for
      // the fields we didn't send this round.
      lastShelf.set(id, {
        status: sendStatus ? (status as MangaStatus) : base.status,
        score: sendScore ? shelfScore : base.score,
      });
      changed = true;
    }
    // On failure: leave the baselines so the next debounce retries this id.
  }

  if (changed) saveBaseline();
};
