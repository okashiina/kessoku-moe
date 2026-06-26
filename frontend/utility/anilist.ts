import { request } from 'graphql-request';

import { getTitleLang, pickTitle } from './titleLang';

// ---------------------------------------------------------------------------
// AniList GraphQL helpers for the landing pages (splash `/` + content `/home`).
//
// We fetch directly with graphql-request in getServerSideProps (no auth, no
// codegen) — the same pattern already used by pages/schedule.tsx and
// pages/browse.tsx. Shapes below mirror the @animeflix/api AnimeInfo /
// AnimeBanner fragments closely enough to hand straight to Card / Section /
// Spotlight (cast at the call site, as browse.tsx does).
// ---------------------------------------------------------------------------

export const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

// AniList rate-limits aggressively (HTTP 429, currently a degraded ~30/min). A
// single 429 on these server-side fetches used to blank the whole page (the
// callers catch and fall back to empty rails). Retry a rate-limited request a
// few times with backoff — honouring `Retry-After` when AniList sends it — so a
// transient limit doesn't wipe Home / the splash. Non-429 errors rethrow at once.
const isRateLimited = (err: unknown): boolean =>
  (err as { response?: { status?: number } } | undefined)?.response?.status ===
  429;

const retryAfterMs = (err: unknown): number | null => {
  const headers = (
    err as { response?: { headers?: { get?: (k: string) => string | null } } }
  )?.response?.headers;
  const raw = headers?.get?.('Retry-After');
  const secs = raw ? Number(raw) : NaN;
  return Number.isFinite(secs) ? secs * 1000 : null;
};

export const requestWithRetry = async <T>(
  endpoint: string,
  query: string,
  variables?: Record<string, unknown>,
  retries = 3
): Promise<T> => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await request<T>(endpoint, query, variables);
    } catch (err) {
      if (!isRateLimited(err) || attempt >= retries) throw err;
      // Bound the wait: AniList can send a long Retry-After (its window is ~60s),
      // and an SSR request must not block that long. Cap each backoff at 2.5s so a
      // rate-limited fetch fails fast and degrades to a cached/empty result instead
      // of hanging the page for many seconds.
      // eslint-disable-next-line no-await-in-loop
      await sleep(Math.min(retryAfterMs(err) ?? 800 * (attempt + 1), 2500));
    }
  }
};

/** Poster-card shape: matches the fields Card/Section read. */
export interface MediaInfo {
  id: number;
  title: { romaji: string | null; english: string | null };
  coverImage: {
    large: string | null;
    medium: string | null;
    color: string | null;
  };
  format: string | null;
  episodes: number | null;
  duration: number | null;
  meanScore: number | null;
}

/** Hero/spotlight shape: card fields plus the wide key art + blurb. */
export interface MediaBanner extends MediaInfo {
  bannerImage: string | null;
  description: string | null;
  genres: string[] | null;
  season: string | null;
  startDate: { year: number | null } | null;
}

export interface AiringEntry {
  episode: number;
  /** Unix seconds. */
  airingAt: number;
  media: MediaInfo | null;
}

// Selection sets reused across queries (inlined — no named fragments needed).
const INFO_FIELDS = `
  id
  title { romaji english }
  coverImage { large medium color }
  format
  episodes
  duration
  meanScore
`;

const BANNER_FIELDS = `
  ${INFO_FIELDS}
  bannerImage
  description
  genres
  season
  startDate { year }
`;

/**
 * Current AniList season + year derived from the server clock. AniList counts
 * December as the *next* year's Winter season.
 */
export const getCurrentSeason = (): { season: string; seasonYear: number } => {
  const now = new Date();
  const month = now.getMonth(); // 0 = Jan ... 11 = Dec
  const year = now.getFullYear();

  if (month === 11) return { season: 'WINTER', seasonYear: year + 1 };
  if (month <= 1) return { season: 'WINTER', seasonYear: year };
  if (month <= 4) return { season: 'SPRING', seasonYear: year };
  if (month <= 7) return { season: 'SUMMER', seasonYear: year };
  return { season: 'FALL', seasonYear: year };
};

const weekWindow = () => {
  const now = Math.floor(Date.now() / 1000);
  return { now, weekFromNow: now + 7 * 24 * 60 * 60 };
};

// ---------------------------------------------------------------------------
// Content home (`/home`)
// ---------------------------------------------------------------------------

export interface HomeData {
  spotlight: MediaBanner[];
  trending: MediaInfo[];
  popular: MediaInfo[];
  topRated: MediaInfo[];
  thisSeason: MediaInfo[];
  recentlyAdded: MediaInfo[];
  airing: AiringEntry[];
}

interface RawPage<T> {
  media: T[];
}

interface RawHome {
  spotlight: RawPage<MediaBanner> | null;
  trending: RawPage<MediaInfo> | null;
  popular: RawPage<MediaInfo> | null;
  topRated: RawPage<MediaInfo> | null;
  thisSeason: RawPage<MediaInfo> | null;
  recentlyAdded: RawPage<MediaInfo> | null;
  airing: { airingSchedules: AiringEntry[] } | null;
}

const HOME_QUERY = /* GraphQL */ `
  query Home(
    $season: MediaSeason
    $seasonYear: Int
    $airingAtGreater: Int
    $airingAtLesser: Int
  ) {
    spotlight: Page(perPage: 12) {
      media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { ${BANNER_FIELDS} }
    }
    trending: Page(perPage: 18) {
      media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { ${INFO_FIELDS} }
    }
    popular: Page(perPage: 18) {
      media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) { ${INFO_FIELDS} }
    }
    topRated: Page(perPage: 18) {
      media(sort: SCORE_DESC, type: ANIME, isAdult: false) { ${INFO_FIELDS} }
    }
    thisSeason: Page(perPage: 18) {
      media(
        sort: POPULARITY_DESC
        type: ANIME
        season: $season
        seasonYear: $seasonYear
        isAdult: false
      ) { ${INFO_FIELDS} }
    }
    recentlyAdded: Page(perPage: 18) {
      media(
        sort: START_DATE_DESC
        type: ANIME
        status_in: [RELEASING, FINISHED]
        isAdult: false
      ) { ${INFO_FIELDS} }
    }
    airing: Page(perPage: 24) {
      airingSchedules(
        airingAt_greater: $airingAtGreater
        airingAt_lesser: $airingAtLesser
        sort: TIME
      ) {
        episode
        airingAt
        media { ${INFO_FIELDS} }
      }
    }
  }
`;

const EMPTY_HOME: HomeData = {
  spotlight: [],
  trending: [],
  popular: [],
  topRated: [],
  thisSeason: [],
  recentlyAdded: [],
  airing: [],
};

export const fetchHomeData = async (): Promise<HomeData> => {
  const { season, seasonYear } = getCurrentSeason();
  const { now, weekFromNow } = weekWindow();

  try {
    const data = await requestWithRetry<RawHome>(ANILIST_ENDPOINT, HOME_QUERY, {
      season,
      seasonYear,
      airingAtGreater: now,
      airingAtLesser: weekFromNow,
    });

    return {
      spotlight: (data.spotlight?.media ?? [])
        .filter((m) => Boolean(m.bannerImage))
        .slice(0, 6),
      trending: data.trending?.media ?? [],
      popular: data.popular?.media ?? [],
      topRated: data.topRated?.media ?? [],
      thisSeason: data.thisSeason?.media ?? [],
      recentlyAdded: data.recentlyAdded?.media ?? [],
      airing: (data.airing?.airingSchedules ?? []).filter(
        (entry) => entry.media != null
      ),
    };
  } catch {
    // Degrade to empty rails rather than 500-ing the page (matches schedule.tsx).
    return EMPTY_HOME;
  }
};

// ---------------------------------------------------------------------------
// Brand splash (`/`) — only needs live proof (trending) + an airing teaser.
// ---------------------------------------------------------------------------

export interface SplashData {
  trending: MediaInfo[];
  airing: AiringEntry[];
  /**
   * Three distinct anime for the feature poster fan: one all-time popular, one
   * trending (center), one from this season. Rotates weekly (see pickWeekly).
   */
  featured: MediaInfo[];
  /** A real cover for the landing "synced to AniList" mockup (Frieren). */
  demoCover: string;
}

// Frieren: Beyond Journey's End — the worked example on the landing mockups. The
// cover is fetched live in the splash query; this is the last-resort fallback so
// the "synced" card is never blank even if that field fails.
const DEMO_ANIME_ID = 154587;
const DEMO_COVER_FALLBACK =
  'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx154587-qQTzQnEJJ3oB.jpg';

// The graceful empty splash — rails blank but the page renders. Exported so the
// landing's SSR cache can return it on a rate-limited miss without re-querying.
export const EMPTY_SPLASH: SplashData = {
  trending: [],
  airing: [],
  featured: [],
  demoCover: DEMO_COVER_FALLBACK,
};

interface RawSplash {
  trending: RawPage<MediaInfo> | null;
  popular: RawPage<MediaInfo> | null;
  thisSeason: RawPage<MediaInfo> | null;
  airing: { airingSchedules: AiringEntry[] } | null;
  demo: { coverImage: { large: string | null; medium: string | null } } | null;
}

const SPLASH_QUERY = /* GraphQL */ `
  query Splash(
    $season: MediaSeason
    $seasonYear: Int
    $airingAtGreater: Int
    $airingAtLesser: Int
  ) {
    trending: Page(perPage: 24) {
      media(sort: TRENDING_DESC, type: ANIME, isAdult: false) { ${INFO_FIELDS} }
    }
    popular: Page(perPage: 24) {
      media(sort: POPULARITY_DESC, type: ANIME, isAdult: false) { ${INFO_FIELDS} }
    }
    thisSeason: Page(perPage: 24) {
      media(
        sort: POPULARITY_DESC
        type: ANIME
        season: $season
        seasonYear: $seasonYear
        isAdult: false
      ) { ${INFO_FIELDS} }
    }
    airing: Page(perPage: 16) {
      airingSchedules(
        airingAt_greater: $airingAtGreater
        airingAt_lesser: $airingAtLesser
        sort: TIME
      ) {
        episode
        airingAt
        media { ${INFO_FIELDS} }
      }
    }
    demo: Media(id: ${DEMO_ANIME_ID}, type: ANIME) {
      coverImage { large medium }
    }
  }
`;

// Deterministic PRNG (mulberry32) so the featured trio stays stable within a
// week but rotates weekly, and shifts as the AniList pools move with current
// popularity. Avoids reshuffling on every refresh.
/* eslint-disable no-bitwise, no-param-reassign, no-multi-assign */
// Bitwise ops are intrinsic to the mulberry32 algorithm.
const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
/* eslint-enable no-bitwise, no-param-reassign, no-multi-assign */

const currentWeekSeed = (): number => {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1).getTime();
  const week = Math.floor((now.getTime() - start) / (7 * 24 * 60 * 60 * 1000));
  return now.getFullYear() * 53 + week;
};

const hasCover = (m: MediaInfo) =>
  Boolean(m && m.coverImage && (m.coverImage.large || m.coverImage.medium));

/** One pick per pool (from its top `topN`), distinct across pools, week-seeded. */
const pickWeekly = (pools: MediaInfo[][], topN = 12): MediaInfo[] => {
  const rng = mulberry32(currentWeekSeed());
  const used = new Set<number>();
  const chosen: MediaInfo[] = [];

  pools.forEach((pool) => {
    const candidates = pool
      .slice(0, topN)
      .filter((m) => hasCover(m) && !used.has(m.id));
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(rng() * candidates.length)];
    used.add(pick.id);
    chosen.push(pick);
  });

  return chosen;
};

export const fetchSplashData = async (): Promise<SplashData> => {
  const { season, seasonYear } = getCurrentSeason();
  const { now, weekFromNow } = weekWindow();

  try {
    const data = await requestWithRetry<RawSplash>(
      ANILIST_ENDPOINT,
      SPLASH_QUERY,
      {
        season,
        seasonYear,
        airingAtGreater: now,
        airingAtLesser: weekFromNow,
      }
    );

    const trending = data.trending?.media ?? [];
    const popular = data.popular?.media ?? [];
    const thisSeason = data.thisSeason?.media ?? [];

    return {
      trending,
      airing: (data.airing?.airingSchedules ?? []).filter(
        (entry) => entry.media != null
      ),
      // Order is popular, trending, season so trending lands center of the fan.
      featured: pickWeekly([popular, trending, thisSeason]),
      demoCover:
        data.demo?.coverImage?.large ||
        data.demo?.coverImage?.medium ||
        DEMO_COVER_FALLBACK,
    };
  } catch {
    return EMPTY_SPLASH;
  }
};

/** Best display title for a media item, honoring the viewer's title-language
 * preference (romaji vs english). Non-reactive (reads the store directly), so
 * React components that must update live on a toggle should use `useTitle`
 * instead; this covers helper/SSR call sites. */
export const mediaTitle = (media: {
  title: { romaji: string | null; english: string | null };
}): string => pickTitle(media.title, getTitleLang()) || 'Untitled';
