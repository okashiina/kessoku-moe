import { authHeader, type AniListSession } from './anilistAuth';
import { getAniListWrite } from './anilistWrite';
import {
  getMangaScore,
  getMangaStatus,
  listSavedManga,
  removeMangaSaved,
  setMangaScore,
  setMangaStatus,
  upsertMangaSaved,
  type MangaListMap,
  type MangaStatus as ShelfStatus,
} from './mangaList';
import {
  getMangaEntry,
  listMangaProgressIds,
  mergeRemoteMangaProgress,
  removeMangaContinue,
  type MangaProgressEntry,
  type MangaProgressMap,
} from './mangaProgress';

const ENDPOINT = 'https://graphql.anilist.co';
type AniMangaStatus =
  | 'CURRENT'
  | 'COMPLETED'
  | 'PLANNING'
  | 'PAUSED'
  | 'DROPPED'
  | 'REPEATING';

const LIST_Q = /* GraphQL */ `
  query ($userId: Int!) {
    MediaListCollection(userId: $userId, type: MANGA) {
      hasNextChunk
      lists {
        entries {
          id
          mediaId
          status
          progress
          score(format: POINT_100)
          updatedAt
          media {
            chapters
            title {
              userPreferred
              romaji
              english
              native
            }
            coverImage {
              large
            }
            countryOfOrigin
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

const DELETE_M = /* GraphQL */ `
  mutation ($id: Int) {
    DeleteMediaListEntry(id: $id) {
      deleted
    }
  }
`;

interface GqlResult<T> {
  data?: T;
}

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
    return json.data ?? null;
  } catch {
    return null;
  }
};

const STATUS_MAP: Record<ShelfStatus, AniMangaStatus> = {
  READING: 'CURRENT',
  COMPLETED: 'COMPLETED',
  PLAN_TO_READ: 'PLANNING',
};

const remoteShelfStatus = (status?: string | null): ShelfStatus | null => {
  switch (status) {
    case 'CURRENT':
    case 'REPEATING':
      return 'READING';
    case 'PLANNING':
      return 'PLAN_TO_READ';
    case 'COMPLETED':
      return 'COMPLETED';
    default:
      return null;
  }
};

const isAniStatus = (status?: string | null): status is AniMangaStatus =>
  Boolean(
    status &&
      [
        'CURRENT',
        'COMPLETED',
        'PLANNING',
        'PAUSED',
        'DROPPED',
        'REPEATING',
      ].includes(status)
  );

interface RemoteEntry {
  id: number;
  mediaId: number;
  status?: string | null;
  progress?: number | null;
  score?: number | null;
  updatedAt?: number | null;
  media?: {
    chapters?: number | null;
    title?: {
      userPreferred?: string | null;
      romaji?: string | null;
      english?: string | null;
      native?: string | null;
    } | null;
    coverImage?: { large?: string | null } | null;
    countryOfOrigin?: string | null;
  } | null;
}
interface ListData {
  MediaListCollection?: {
    hasNextChunk?: boolean | null;
    lists?: ({ entries?: (RemoteEntry | null)[] | null } | null)[] | null;
  } | null;
}

// In-memory remote baseline. It is rebuilt by every login pull. Persisted data
// contains user intent only, which keeps it safe if another AniList account logs in.
const entryIdByMedia = new Map<number, number>();
const remoteProgress = new Map<number, number>();
const remoteStatus = new Map<number, AniMangaStatus>();
const remoteScore = new Map<number, number>();
const remoteTotal = new Map<number, number>();
const knownRemote = new Set<number>();
let pulledOnce = false;
let applyingRemote = false;

export const isApplyingMangaRemote = (): boolean => applyingRemote;

const META_KEY = 'kessoku.anilist.mangaSync.v2';
interface SyncMeta {
  userId?: number;
  tombstones: Record<number, number>;
  dirtyShelf: Record<number, number>;
  dirtyProgress: Record<number, number>;
  seenRemote: Record<number, number>;
  // Local rows that belonged to a different AniList account. They stay on this
  // device but cannot be written into the newly signed-in account until that
  // user explicitly edits them or AniList itself confirms they already exist.
  foreign: Record<number, number>;
}
let meta: SyncMeta = {
  tombstones: {},
  dirtyShelf: {},
  dirtyProgress: {},
  seenRemote: {},
  foreign: {},
};
let metaLoaded = false;

const loadMeta = (): void => {
  if (metaLoaded || typeof window === 'undefined') return;
  metaLoaded = true;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(META_KEY) ?? '{}'
    ) as Partial<SyncMeta>;
    // v2 used one dirty bucket. Keep it in both buckets during migration: this
    // favours preserving an old local change over overwriting it on first pull.
    const legacyDirty = (parsed as { dirty?: Record<number, number> }).dirty;
    meta = {
      userId: parsed.userId,
      tombstones: parsed.tombstones ?? {},
      dirtyShelf: { ...(parsed.dirtyShelf ?? legacyDirty ?? {}) },
      dirtyProgress: { ...(parsed.dirtyProgress ?? legacyDirty ?? {}) },
      seenRemote: parsed.seenRemote ?? {},
      foreign: parsed.foreign ?? {},
    };
  } catch {
    /* corrupt metadata is treated as new */
  }
};

const saveMeta = (): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* best effort */
  }
};

const resetRemoteBaseline = (): void => {
  entryIdByMedia.clear();
  remoteProgress.clear();
  remoteStatus.clear();
  remoteScore.clear();
  remoteTotal.clear();
  knownRemote.clear();
  pulledOnce = false;
};

const selectAccount = (userId: number): void => {
  loadMeta();
  if (meta.userId !== undefined && meta.userId !== userId) {
    const foreign = Object.fromEntries(
      Array.from(
        new Set<number>([
          ...listSavedManga().map((entry) => entry.id),
          ...listMangaProgressIds(),
        ])
      ).map((id) => [id, Date.now()])
    ) as Record<number, number>;
    meta = {
      userId,
      tombstones: {},
      dirtyShelf: {},
      dirtyProgress: {},
      seenRemote: {},
      foreign,
    };
    resetRemoteBaseline();
    saveMeta();
  } else if (meta.userId === undefined) {
    meta.userId = userId;
    saveMeta();
  }
};

let prevShelf: MangaListMap | null = null;
let prevProgress: MangaProgressMap | null = null;
const shelfMap = (): MangaListMap =>
  Object.fromEntries(
    listSavedManga().map((entry) => [entry.id, entry])
  ) as MangaListMap;
const progressMap = (): MangaProgressMap =>
  Object.fromEntries(
    listMangaProgressIds().map((id) => [id, getMangaEntry(id)])
  ) as MangaProgressMap;
const resetDiffBaseline = (): void => {
  prevShelf = shelfMap();
  prevProgress = progressMap();
};

export const initMangaBaseline = (): void => {
  loadMeta();
  resetDiffBaseline();
};

const aniListMangaProgress = (entry?: MangaProgressEntry): number => {
  if (!entry) return 0;
  const maxRead = entry.read.length ? Math.max(...entry.read) : 0;
  return Math.max(0, Math.floor(Math.max(maxRead, entry.ch || 0)));
};

/** Persist a user edit synchronously so a later remote pull cannot clobber it. */
export const noteMangaLocalChange = (): void => {
  if (applyingRemote) {
    resetDiffBaseline();
    return;
  }
  loadMeta();
  const shelf = shelfMap();
  const progress = progressMap();
  let changed = false;
  new Set<number>([
    ...Object.keys(prevShelf ?? {}).map(Number),
    ...Object.keys(shelf).map(Number),
  ]).forEach((id) => {
    const before = prevShelf?.[id];
    const after = shelf[id];
    if (before && !after) {
      // Removing a row quarantined from another account is only local cleanup;
      // it must not make that row's leftover progress eligible for this account.
      if (!meta.foreign[id]) {
        meta.tombstones[id] = Date.now();
        delete meta.dirtyShelf[id];
        delete meta.dirtyProgress[id];
        changed = true;
      }
    } else if (
      after &&
      (!before ||
        before.status !== after.status ||
        before.score !== after.score)
    ) {
      meta.dirtyShelf[id] = Date.now();
      delete meta.tombstones[id];
      delete meta.foreign[id];
      changed = true;
    }
  });
  new Set<number>([
    ...Object.keys(prevProgress ?? {}).map(Number),
    ...Object.keys(progress).map(Number),
  ]).forEach((id) => {
    const before = prevProgress?.[id];
    const after = progress[id];
    if (
      after &&
      (!before || aniListMangaProgress(after) !== aniListMangaProgress(before))
    ) {
      meta.dirtyProgress[id] = Date.now();
      delete meta.tombstones[id];
      delete meta.foreign[id];
      changed = true;
    }
  });
  prevShelf = shelf;
  prevProgress = progress;
  if (changed) saveMeta();
};

const progressStatus = (progress: number, total: number): AniMangaStatus =>
  total > 0 && progress >= total ? 'COMPLETED' : 'CURRENT';

const remoteTitle = (entry: RemoteEntry): string =>
  entry.media?.title?.userPreferred ||
  entry.media?.title?.romaji ||
  entry.media?.title?.english ||
  entry.media?.title?.native ||
  'Untitled';

/** Pull the MANGA collection into My List and Continue Reading. */
export const pullMangaAndMerge = async (
  session: AniListSession
): Promise<boolean> => {
  selectAccount(session.user.id);
  const data = await gql<ListData>(
    LIST_Q,
    { userId: session.user.id },
    session.token
  );
  const collection = data?.MediaListCollection;
  if (!collection) return false;
  const pulled = new Set<number>();
  applyingRemote = true;
  try {
    (collection.lists ?? []).forEach((list) =>
      (list?.entries ?? []).forEach((entry) => {
        if (!entry?.mediaId) return;
        const id = entry.mediaId;
        pulled.add(id);
        knownRemote.add(id);
        entryIdByMedia.set(id, entry.id);
        remoteProgress.set(id, entry.progress ?? 0);
        remoteScore.set(id, typeof entry.score === 'number' ? entry.score : 0);
        if (entry.media?.chapters) remoteTotal.set(id, entry.media.chapters);
        if (isAniStatus(entry.status)) remoteStatus.set(id, entry.status);
        delete meta.foreign[id];
        if (meta.tombstones[id]) return;

        const info = {
          id,
          title: remoteTitle(entry),
          cover: entry.media?.coverImage?.large ?? null,
          country: entry.media?.countryOfOrigin ?? null,
        };
        upsertMangaSaved(info);
        if (!meta.dirtyShelf[id]) {
          setMangaStatus(id, remoteShelfStatus(entry.status), info);
          setMangaScore(
            id,
            typeof entry.score === 'number' ? entry.score : 0,
            info
          );
        }
        if ((entry.progress ?? 0) > 0) {
          mergeRemoteMangaProgress(id, entry.progress ?? 0, {
            total: entry.media?.chapters ?? undefined,
            title: info.title,
            cover: info.cover,
            updatedAt: (entry.updatedAt ?? 0) * 1000,
          });
        }
      })
    );

    // A chunked response is incomplete and must never be interpreted as deletes.
    if (!collection.hasNextChunk) {
      Object.keys(meta.seenRemote)
        .map(Number)
        .forEach((id) => {
          if (pulled.has(id)) return;
          delete meta.seenRemote[id];
          if (
            meta.dirtyShelf[id] ||
            meta.dirtyProgress[id] ||
            meta.tombstones[id]
          )
            return;
          removeMangaSaved(id);
          removeMangaContinue(id);
          entryIdByMedia.delete(id);
          remoteProgress.delete(id);
          remoteStatus.delete(id);
          remoteScore.delete(id);
          remoteTotal.delete(id);
          knownRemote.delete(id);
        });
    }
    pulled.forEach((id) => {
      meta.seenRemote[id] = Date.now();
    });
    saveMeta();
  } finally {
    applyingRemote = false;
  }
  pulledOnce = true;
  resetDiffBaseline();
  return true;
};

interface PushPlan {
  status: AniMangaStatus;
  progress: number;
  score: number;
}
const planPush = (id: number, saved: boolean): PushPlan | null => {
  if (meta.foreign[id]) return null;
  const entry = getMangaEntry(id);
  const progress = aniListMangaProgress(entry);
  const shelfStatus = getMangaStatus(id);
  const localStatus = shelfStatus ? STATUS_MAP[shelfStatus] : undefined;
  const localScore = getMangaScore(id);
  const total = entry?.total ?? remoteTotal.get(id) ?? 0;
  if (!knownRemote.has(id)) {
    if (
      !saved &&
      progress <= 0 &&
      !meta.dirtyShelf[id] &&
      !meta.dirtyProgress[id]
    )
      return null;
    return {
      status:
        localStatus ??
        (progress > 0 ? progressStatus(progress, total) : 'PLANNING'),
      progress,
      score: localScore,
    };
  }
  const remoteSt = remoteStatus.get(id);
  const remoteProg = remoteProgress.get(id) ?? 0;
  const remoteSc = remoteScore.get(id) ?? 0;
  let status =
    remoteSt ??
    (meta.dirtyShelf[id] ? localStatus : undefined) ??
    progressStatus(progress, total);
  let changed = false;
  if (meta.dirtyShelf[id]) {
    // AniList has no status-less saved row. Clearing Kessoku's explicit shelf
    // state is therefore an intentional downgrade to Planning. Two remote
    // states do not map losslessly into Kessoku, though: a score-only edit must
    // preserve REPEATING (shown locally as Reading) and PAUSED/DROPPED (shown
    // without a local status) instead of silently rewriting them.
    if (remoteSt === 'REPEATING' && localStatus === 'CURRENT') {
      status = remoteSt;
    } else if (
      (remoteSt === 'PAUSED' || remoteSt === 'DROPPED') &&
      !localStatus
    ) {
      status = remoteSt;
    } else {
      status = localStatus ?? 'PLANNING';
    }
    changed = status !== remoteSt || localScore !== remoteSc;
  }
  if (progress > remoteProg) {
    changed = true;
    if (
      !meta.dirtyShelf[id] &&
      (!remoteSt || remoteSt === 'PLANNING' || remoteSt === 'CURRENT')
    ) {
      status = progressStatus(progress, total);
    }
  }
  return changed
    ? { status, progress: Math.max(progress, remoteProg), score: localScore }
    : null;
};

/** Push local shelves/progress and delete locally removed AniList entries. */
export const pushMangaChanges = async (
  session: AniListSession
): Promise<void> => {
  if (!getAniListWrite()) return;
  selectAccount(session.user.id);
  // Never mutate AniList against an unknown baseline. In particular, a failed
  // startup pull must not treat every stale local row as new remote data.
  if (!pulledOnce) return;
  const saved = new Set(listSavedManga().map((entry) => entry.id));
  const ids = new Set<number>([
    ...Array.from(saved),
    ...listMangaProgressIds(),
    ...Object.keys(meta.dirtyShelf).map(Number),
    ...Object.keys(meta.dirtyProgress).map(Number),
  ]);
  let metaChanged = false;
  // eslint-disable-next-line no-restricted-syntax
  for (const id of Array.from(ids)) {
    // eslint-disable-next-line no-continue
    if (meta.tombstones[id]) continue;
    const plan = planPush(id, saved.has(id));
    let ok = true;
    if (plan) {
      // eslint-disable-next-line no-await-in-loop
      const res = await gql<{
        SaveMediaListEntry?: { id: number; mediaId: number };
      }>(
        SAVE_M,
        {
          mediaId: id,
          status: plan.status,
          progress: plan.progress,
          scoreRaw: plan.score,
        },
        session.token
      );
      const result = res?.SaveMediaListEntry;
      ok = Boolean(result?.id && result.mediaId);
      if (result?.id && result.mediaId) {
        entryIdByMedia.set(id, result.id);
        knownRemote.add(id);
        remoteProgress.set(id, plan.progress);
        remoteStatus.set(id, plan.status);
        remoteScore.set(id, plan.score);
      }
    }
    if (ok && meta.dirtyShelf[id] !== undefined) {
      delete meta.dirtyShelf[id];
      metaChanged = true;
    }
    if (ok && meta.dirtyProgress[id] !== undefined) {
      delete meta.dirtyProgress[id];
      metaChanged = true;
    }
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const id of Object.keys(meta.tombstones).map(Number)) {
    if (saved.has(id)) {
      delete meta.tombstones[id];
      metaChanged = true;
      // eslint-disable-next-line no-continue
      continue;
    }
    const entryId = entryIdByMedia.get(id);
    if (entryId) {
      // eslint-disable-next-line no-await-in-loop
      const res = await gql<{
        DeleteMediaListEntry?: { deleted?: boolean | null };
      }>(DELETE_M, { id: entryId }, session.token);
      if (res?.DeleteMediaListEntry?.deleted) {
        entryIdByMedia.delete(id);
        knownRemote.delete(id);
        remoteProgress.delete(id);
        remoteStatus.delete(id);
        remoteScore.delete(id);
        delete meta.tombstones[id];
        metaChanged = true;
      }
    } else if (pulledOnce && !knownRemote.has(id)) {
      delete meta.tombstones[id];
      metaChanged = true;
    }
  }
  if (metaChanged) saveMeta();
};
