// Server-side episode-recap grounding. Two key-free sources, tried in order:
//   1. Kitsu — structured per-episode synopses (read endpoints need no key; the
//      repo already talks to Kitsu elsewhere).
//   2. Jikan (the MyAnimeList API) — far better coverage of episode TITLES and
//      premises for long-running series (One Piece, etc.), where Kitsu returns
//      nothing. A bare title is still real grounding: it lets the companion
//      anchor on what the episode is actually called instead of guessing the arc.
// The companion stays "lazy": nothing here runs until the viewer asks to look
// back, every public call is a SMALL bounded fetch, and module-level caches make
// repeat asks free (synopses are static). The CALLER clamps which episodes are
// allowed (only ones strictly before the viewer's current episode — never the
// current one or anything ahead), so this module never decides spoiler policy;
// it only fetches already-aired summaries.

const KITSU = 'https://kitsu.io/api/edge';
const JIKAN = 'https://api.jikan.moe/v4';

export interface RecapEpisode {
  number: number;
  title: string;
  // May be empty: Jikan often has the title but no written synopsis for fresh
  // long-runner episodes. The caller renders title-only grounding in that case.
  synopsis: string;
}

export interface RecapSource {
  title: string;
  year?: number;
}

interface KitsuAnimeAttrs {
  canonicalTitle?: string | null;
  subtype?: string | null;
  startDate?: string | null;
  synopsis?: string | null;
  description?: string | null;
}
interface KitsuEpisodeAttrs {
  number?: number | null;
  canonicalTitle?: string | null;
  synopsis?: string | null;
  description?: string | null;
}
interface KitsuItem<A> {
  id: string;
  attributes?: A | null;
}
interface KitsuList<A> {
  data?: KitsuItem<A>[] | null;
}
interface KitsuOne<A> {
  data?: KitsuItem<A> | null;
}

interface JikanSearchItem {
  mal_id: number;
  title?: string | null;
  title_english?: string | null;
  titles?: { type?: string | null; title?: string | null }[] | null;
  type?: string | null;
  year?: number | null;
  aired?: { prop?: { from?: { year?: number | null } | null } | null } | null;
}
interface JikanEpisodeAttrs {
  title?: string | null;
  title_romanji?: string | null;
  synopsis?: string | null;
}
interface JikanAnimeAttrs {
  synopsis?: string | null;
}
interface JikanWrap<A> {
  data?: A | null;
}

// Caches persist for the life of the server process (Next dev keeps the module
// warm; the Railway container is a long-running Node server) → re-asks are free.
const idCache = new Map<string, number | null>();
const epCache = new Map<string, RecapEpisode | null>();
const synopsisCache = new Map<number, string | null>();
const malIdCache = new Map<string, number | null>();
const malEpCache = new Map<string, RecapEpisode | null>();
const malSynopsisCache = new Map<number, string | null>();

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

const clip = (s: string, max: number): string =>
  s.length > max ? `${s.slice(0, max)}…` : s;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const kitsuFetch = async <T>(path: string): Promise<T | null> => {
  try {
    const res = await fetch(`${KITSU}${path}`, {
      headers: { Accept: 'application/vnd.api+json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
};

// Jikan caps callers at ~3 req/s. Recap fetches are already gated upstream by the
// companion rate limiter, but a single "story so far" can fan into a few calls,
// so we serialize Jikan requests through one chain and space them. One 429 retry
// honors Retry-After. Everything fails open to null (recap is best-effort).
const JIKAN_MIN_GAP_MS = 400; // ≤ 2.5 req/s, comfortably under the 3/s cap
let jikanGate: Promise<void> = Promise.resolve();
let jikanLast = 0;

const jikanFetch = async <T>(path: string): Promise<T | null> => {
  const run = jikanGate.then(async (): Promise<T | null> => {
    const wait = JIKAN_MIN_GAP_MS - (Date.now() - jikanLast);
    if (wait > 0) await sleep(wait);
    try {
      let res = await fetch(`${JIKAN}${path}`, {
        headers: { Accept: 'application/json' },
      });
      if (res.status === 429) {
        const ra = Number(res.headers.get('retry-after'));
        await sleep(
          (Number.isFinite(ra) && ra > 0 ? Math.min(ra, 5) : 1) * 1000
        );
        res = await fetch(`${JIKAN}${path}`, {
          headers: { Accept: 'application/json' },
        });
      }
      jikanLast = Date.now();
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      jikanLast = Date.now();
      return null;
    }
  });
  // Keep the gate chained but never let a rejection poison later calls.
  jikanGate = run.then(
    () => undefined,
    () => undefined
  );
  return run;
};

// Resolve a title to its Kitsu anime id. Best TV match; a year breaks ties
// between seasons/recaps that share a title.
const resolveAnimeId = async (
  title: string,
  year?: number
): Promise<number | null> => {
  const key = `${norm(title)}|${year ?? ''}`;
  const cached = idCache.get(key);
  if (cached !== undefined) return cached;

  const data = await kitsuFetch<KitsuList<KitsuAnimeAttrs>>(
    `/anime?filter[text]=${encodeURIComponent(title)}&page[limit]=5`
  );
  const list = data?.data ?? [];
  const score = (a: KitsuItem<KitsuAnimeAttrs>): number => {
    const at = a.attributes ?? {};
    let s = 0;
    if (at.subtype === 'TV' || at.subtype === 'movie') s += 2;
    if (year && at.startDate && at.startDate.slice(0, 4) === String(year))
      s += 3;
    if (at.canonicalTitle && norm(at.canonicalTitle) === norm(title)) s += 2;
    return s;
  };
  const best = [...list].sort((a, b) => score(b) - score(a))[0];
  const id = best ? Number(best.id) : null;
  idCache.set(key, id);
  return id;
};

const fetchEpisodeKitsu = async (
  animeId: number,
  n: number
): Promise<RecapEpisode | null> => {
  const key = `${animeId}:${n}`;
  const cached = epCache.get(key);
  if (cached !== undefined) return cached;

  const data = await kitsuFetch<KitsuList<KitsuEpisodeAttrs>>(
    `/anime/${animeId}/episodes?filter[number]=${n}`
  );
  const at = (data?.data ?? [])[0]?.attributes;
  const synopsis = (at?.synopsis || at?.description || '').trim();
  // Kitsu is only worth keeping when it actually has prose — a bare Kitsu title
  // is rarely better than what Jikan returns, so fall through to Jikan instead.
  const result: RecapEpisode | null = synopsis
    ? {
        number: n,
        title: at?.canonicalTitle?.trim() || '',
        synopsis: clip(synopsis, 500),
      }
    : null;
  epCache.set(key, result);
  return result;
};

// Resolve a title to its MyAnimeList id via Jikan search. Same scoring shape as
// the Kitsu resolver.
const resolveMalId = async (
  title: string,
  year?: number
): Promise<number | null> => {
  const key = `${norm(title)}|${year ?? ''}`;
  const cached = malIdCache.get(key);
  if (cached !== undefined) return cached;

  const data = await jikanFetch<{ data?: JikanSearchItem[] | null }>(
    `/anime?q=${encodeURIComponent(title)}&limit=8&sfw`
  );
  const list = data?.data ?? [];
  const yearOf = (a: JikanSearchItem): number | undefined =>
    a.year ?? a.aired?.prop?.from?.year ?? undefined;
  const score = (a: JikanSearchItem): number => {
    let s = 0;
    // TV must strictly outrank Movie: Jikan returns "One Piece Movie 01" before
    // the TV series for q="One Piece", and an episode-number lookup only makes
    // sense against the series, so a movie must never win a tie.
    if (a.type === 'TV') s += 3;
    else if (a.type === 'Movie') s += 1;
    const y = yearOf(a);
    if (year && y && y === year) s += 3;
    const names = [a.title, a.title_english]
      .concat((a.titles ?? []).map((t) => t.title ?? null))
      .filter((t): t is string => Boolean(t))
      .map(norm);
    if (names.some((nm) => nm === norm(title))) s += 2;
    return s;
  };
  const best = [...list].sort((a, b) => score(b) - score(a))[0];
  const id = best ? best.mal_id : null;
  malIdCache.set(key, id);
  return id;
};

const fetchEpisodeJikan = async (
  src: RecapSource,
  n: number
): Promise<RecapEpisode | null> => {
  const id = await resolveMalId(src.title, src.year);
  if (!id) return null;
  const key = `${id}:${n}`;
  const cached = malEpCache.get(key);
  if (cached !== undefined) return cached;

  const data = await jikanFetch<JikanWrap<JikanEpisodeAttrs>>(
    `/anime/${id}/episodes/${n}`
  );
  const at = data?.data;
  const synopsis = (at?.synopsis || '').trim();
  const epTitle = (at?.title || at?.title_romanji || '').trim();
  // Accept a title even without a synopsis — for long-runners MAL almost always
  // has the title, and that alone keeps the companion from inventing the arc.
  const result: RecapEpisode | null =
    synopsis || epTitle
      ? {
          number: n,
          title: epTitle,
          synopsis: synopsis ? clip(synopsis, 500) : '',
        }
      : null;
  malEpCache.set(key, result);
  return result;
};

// One episode from whichever source has it: Kitsu prose first, then Jikan.
const fetchEpisodeAny = async (
  kitsuId: number | null,
  src: RecapSource,
  n: number
): Promise<RecapEpisode | null> => {
  const fromKitsu = kitsuId ? await fetchEpisodeKitsu(kitsuId, n) : null;
  if (fromKitsu) return fromKitsu;
  return fetchEpisodeJikan(src, n);
};

/** One earlier episode's recap. The caller must pass an episode < current. */
export const recapEpisode = async (
  src: RecapSource,
  n: number
): Promise<RecapEpisode | null> => {
  const kitsuId = await resolveAnimeId(src.title, src.year);
  return fetchEpisodeAny(kitsuId, src, n);
};

/** Up to `count` episodes ending at `upTo` (inclusive), oldest first. Bounded. */
export const recapEpisodes = async (
  src: RecapSource,
  upTo: number,
  count: number
): Promise<RecapEpisode[]> => {
  if (upTo < 1) return [];
  const kitsuId = await resolveAnimeId(src.title, src.year);
  const from = Math.max(1, upTo - count + 1);
  const out: RecapEpisode[] = [];
  for (let n = from; n <= upTo; n += 1) {
    // eslint-disable-next-line no-await-in-loop
    const ep = await fetchEpisodeAny(kitsuId, src, n);
    if (ep) out.push(ep);
  }
  return out;
};

const seriesSynopsisJikan = async (
  src: RecapSource
): Promise<string | null> => {
  const id = await resolveMalId(src.title, src.year);
  if (!id) return null;
  const cached = malSynopsisCache.get(id);
  if (cached !== undefined) return cached;
  const data = await jikanFetch<JikanWrap<JikanAnimeAttrs>>(`/anime/${id}`);
  const syn = (data?.data?.synopsis || '').trim();
  const result = syn ? clip(syn, 600) : null;
  malSynopsisCache.set(id, result);
  return result;
};

/** A series' overall premise (used to unlock a prequel without enumerating its
 * episodes). One fetch per source, cached. */
export const seriesSynopsis = async (
  src: RecapSource
): Promise<string | null> => {
  const id = await resolveAnimeId(src.title, src.year);
  if (id) {
    const cached = synopsisCache.get(id);
    if (cached !== undefined && cached !== null) return cached;
    if (cached === undefined) {
      const data = await kitsuFetch<KitsuOne<KitsuAnimeAttrs>>(`/anime/${id}`);
      const at = data?.data?.attributes;
      const syn = (at?.synopsis || at?.description || '').trim();
      const result = syn ? clip(syn, 600) : null;
      synopsisCache.set(id, result);
      if (result) return result;
    }
  }
  // Kitsu had no premise on record — try Jikan.
  return seriesSynopsisJikan(src);
};
