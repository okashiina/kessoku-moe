import { ANILIST_ENDPOINT, requestWithRetry } from './anilist';

// ---------------------------------------------------------------------------
// AniList GraphQL for the manga catalog (type: MANGA). AniList is the metadata
// layer — covers, descriptions, genres, status, chapter counts, and the
// countryOfOrigin that splits manga (JP) / manhwa (KR) / manhua (CN). Page
// images come from MangaDex (see utility/server/mangadex.ts); AniList serves
// none. Mirrors the anilist.ts pattern (graphql-request + retry-on-429).
// ---------------------------------------------------------------------------

export interface MangaInfo {
  id: number;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  coverImage: {
    large: string | null;
    medium: string | null;
    color: string | null;
  };
  format: string | null;
  status: string | null;
  chapters: number | null;
  volumes: number | null;
  countryOfOrigin: string | null;
  meanScore: number | null;
  genres: string[] | null;
}

export interface MangaCharacter {
  role: string | null;
  node: {
    id: number;
    name: { full: string | null } | null;
    image: { medium: string | null } | null;
  } | null;
}

export interface MangaDetail extends MangaInfo {
  bannerImage: string | null;
  description: string | null;
  synonyms: string[] | null;
  startDate: { year: number | null } | null;
  isAdult: boolean | null;
  characters: { edges: (MangaCharacter | null)[] | null } | null;
}

const INFO = `
  id
  title { romaji english native }
  coverImage { large medium color }
  format
  status
  chapters
  volumes
  countryOfOrigin
  meanScore
  genres
`;

const DETAIL = `
  ${INFO}
  bannerImage
  description(asHtml: false)
  synonyms
  startDate { year }
  isAdult
  characters(sort: [ROLE, RELEVANCE], perPage: 50) {
    edges {
      role
      node {
        id
        name { full }
        image { medium }
      }
    }
  }
`;

export interface MangaHome {
  trending: MangaInfo[];
  popular: MangaInfo[];
  topRated: MangaInfo[];
  manhwa: MangaInfo[];
  newReleases: MangaInfo[];
}

const EMPTY_HOME: MangaHome = {
  trending: [],
  popular: [],
  topRated: [],
  manhwa: [],
  newReleases: [],
};

interface RawPage<T> {
  media: T[];
}

interface RawMangaHome {
  trending: RawPage<MangaInfo> | null;
  popular: RawPage<MangaInfo> | null;
  topRated: RawPage<MangaInfo> | null;
  manhwa: RawPage<MangaInfo> | null;
  newReleases: RawPage<MangaInfo> | null;
}

// AniList treats `isAdult: null` as "match nothing", so we can't pass null to mean
// "both". Instead we inject `isAdult: false` only when SFW; omitting the arg
// entirely (NSFW on) returns adult + non-adult.
const homeQuery = (nsfw: boolean): string => {
  const adult = nsfw ? '' : ', isAdult: false';
  return /* GraphQL */ `
  query MangaHome {
    trending: Page(perPage: 24) {
      media(sort: TRENDING_DESC, type: MANGA${adult}) { ${INFO} }
    }
    popular: Page(perPage: 24) {
      media(sort: POPULARITY_DESC, type: MANGA${adult}) { ${INFO} }
    }
    topRated: Page(perPage: 24) {
      media(sort: SCORE_DESC, type: MANGA${adult}) { ${INFO} }
    }
    manhwa: Page(perPage: 24) {
      media(sort: TRENDING_DESC, type: MANGA, countryOfOrigin: "KR"${adult}) { ${INFO} }
    }
    newReleases: Page(perPage: 24) {
      media(sort: START_DATE_DESC, type: MANGA, status_in: [RELEASING]${adult}) { ${INFO} }
    }
  }
`;
};

export const fetchMangaHome = async (nsfw = false): Promise<MangaHome> => {
  try {
    const data = await requestWithRetry<RawMangaHome>(
      ANILIST_ENDPOINT,
      homeQuery(nsfw)
    );
    return {
      trending: data.trending?.media ?? [],
      popular: data.popular?.media ?? [],
      topRated: data.topRated?.media ?? [],
      manhwa: data.manhwa?.media ?? [],
      newReleases: data.newReleases?.media ?? [],
    };
  } catch {
    return EMPTY_HOME;
  }
};

interface RawDetail {
  Media: MangaDetail | null;
}

const DETAIL_QUERY = /* GraphQL */ `
  query MangaDetail($id: Int) {
    Media(id: $id, type: MANGA) { ${DETAIL} }
  }
`;

export const fetchMangaDetail = async (
  id: number
): Promise<MangaDetail | null> => {
  try {
    const data = await requestWithRetry<RawDetail>(
      ANILIST_ENDPOINT,
      DETAIL_QUERY,
      { id }
    );
    return data.Media ?? null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Browse / search (advanced filters), mirroring browse.tsx for anime.
// ---------------------------------------------------------------------------

export interface MangaBrowseResult {
  media: MangaInfo[];
  hasNextPage: boolean;
  currentPage: number;
}

interface RawBrowse {
  Page: {
    media: MangaInfo[];
    pageInfo: { hasNextPage: boolean; currentPage: number };
  } | null;
}

const browseQuery = (nsfw: boolean): string => {
  const adult = nsfw ? '' : '\n        isAdult: false';
  return /* GraphQL */ `
  query MangaBrowse(
    $page: Int
    $perPage: Int
    $sort: [MediaSort]
    $search: String
    $genre_in: [String]
    $tag_in: [String]
    $countryOfOrigin: CountryCode
    $format: MediaFormat
    $status: MediaStatus
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage currentPage }
      media(
        type: MANGA
        sort: $sort
        search: $search
        genre_in: $genre_in
        tag_in: $tag_in
        countryOfOrigin: $countryOfOrigin
        format: $format
        status: $status${adult}
      ) { ${INFO} }
    }
  }
`;
};

export const fetchMangaBrowse = async (
  variables: Record<string, unknown>,
  nsfw = false
): Promise<MangaBrowseResult> => {
  try {
    const data = await requestWithRetry<RawBrowse>(
      ANILIST_ENDPOINT,
      browseQuery(nsfw),
      variables
    );
    return {
      media: data.Page?.media ?? [],
      hasNextPage: data.Page?.pageInfo?.hasNextPage ?? false,
      currentPage: data.Page?.pageInfo?.currentPage ?? 1,
    };
  } catch {
    return { media: [], hasNextPage: false, currentPage: 1 };
  }
};

// Candidate titles for MangaDex resolution, most-specific first.
export const mangaSearchTitles = (m: {
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  synonyms?: string[] | null;
}): string[] => {
  const out = [
    m.title.english,
    m.title.romaji,
    m.title.native,
    ...(m.synonyms ?? []),
  ];
  return Array.from(new Set(out.filter((t): t is string => Boolean(t))));
};

/** Human label for a series' origin. */
export const originLabel = (country: string | null | undefined): string => {
  switch (country) {
    case 'KR':
      return 'Manhwa';
    case 'CN':
    case 'TW':
      return 'Manhua';
    case 'JP':
      return 'Manga';
    default:
      return 'Comic';
  }
};

/** Long-strip/webtoon is the right default for Korean/Chinese vertical comics. */
export const defaultWebtoon = (country: string | null | undefined): boolean =>
  country === 'KR' || country === 'CN' || country === 'TW';
