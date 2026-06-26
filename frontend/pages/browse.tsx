import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { useRouter } from 'next/router';

import { NextSeo } from 'next-seo';

import Card from '@components/anime/Card';
import AnimeVibeSearch from '@components/anime/VibeSearch';
import Header from '@components/Header';
import progressBar from '@components/Progress';
import { ANILIST_ENDPOINT, requestWithRetry } from '@utility/anilist';
import { cached } from '@utility/ssrCache';

// ---------------------------------------------------------------------------
// AniList GraphQL (fetched directly in getServerSideProps — no auth needed).
// We map AniList Media to the exact shape `@components/anime/Card` expects.
// ---------------------------------------------------------------------------

interface AniListMedia {
  id: number;
  title: { romaji: string | null; english: string | null };
  coverImage: {
    large: string | null;
    medium: string | null;
    color: string | null;
  };
  format: string | null;
  duration: number | null;
  meanScore: number | null;
  genres: string[] | null;
  seasonYear: number | null;
}

interface BrowseData {
  Page: {
    media: AniListMedia[];
    pageInfo: { hasNextPage: boolean; currentPage: number };
  };
}

const BROWSE_QUERY = /* GraphQL */ `
  query Browse(
    $page: Int
    $perPage: Int
    $sort: [MediaSort]
    $genre_in: [String]
    $seasonYear: Int
    $season: MediaSeason
    $format: MediaFormat
    $status: MediaStatus
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        hasNextPage
        currentPage
      }
      media(
        type: ANIME
        sort: $sort
        genre_in: $genre_in
        seasonYear: $seasonYear
        season: $season
        format: $format
        status: $status
        isAdult: false
      ) {
        id
        title {
          romaji
          english
        }
        coverImage {
          large
          medium
          color
        }
        format
        duration
        meanScore
        genres
        seasonYear
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Filter option metadata.
// ---------------------------------------------------------------------------

const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

const FORMATS = ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL'];

const STATUSES: { value: string; label: string }[] = [
  { value: 'RELEASING', label: 'Releasing' },
  { value: 'FINISHED', label: 'Finished' },
  { value: 'NOT_YET_RELEASED', label: 'Upcoming' },
];

const SORTS: { value: string; label: string }[] = [
  { value: 'POPULARITY_DESC', label: 'Popularity' },
  { value: 'SCORE_DESC', label: 'Score' },
  { value: 'TRENDING_DESC', label: 'Trending' },
  { value: 'START_DATE_DESC', label: 'Newest' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS: number[] = Array.from(
  { length: CURRENT_YEAR + 1 - 1990 + 1 },
  (_, i) => CURRENT_YEAR + 1 - i
);

const PER_PAGE = 30;

// Read a single string value from the (possibly array) query param.
const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

interface BrowseProps {
  media: AniListMedia[];
  hasNextPage: boolean;
  currentPage: number;
}

export const getServerSideProps: GetServerSideProps<BrowseProps> = async (
  context
) => {
  const { query } = context;

  const page = Math.max(1, parseInt(firstParam(query.page), 10) || 1);
  const genre = firstParam(query.genre);
  const year = parseInt(firstParam(query.year), 10);
  const season = firstParam(query.season).toUpperCase();
  const format = firstParam(query.format).toUpperCase();
  const status = firstParam(query.status).toUpperCase();
  const sort = firstParam(query.sort).toUpperCase() || 'POPULARITY_DESC';

  const variables: Record<string, unknown> = {
    page,
    perPage: PER_PAGE,
    sort: [SORTS.some((s) => s.value === sort) ? sort : 'POPULARITY_DESC'],
  };

  if (GENRES.includes(genre)) variables.genre_in = [genre];
  if (Number.isFinite(year)) variables.seasonYear = year;
  if (SEASONS.includes(season)) variables.season = season;
  if (FORMATS.includes(format)) variables.format = format;
  if (STATUSES.some((s) => s.value === status)) variables.status = status;

  let media: AniListMedia[] = [];
  let hasNextPage = false;
  let currentPage = page;

  try {
    // graphql-request (not global fetch) so this works on the Node 16 runtime;
    // retry on AniList 429 so a transient rate-limit doesn't blank the grid, and
    // cache per filter-combo so repeat browsing doesn't re-hit the degraded
    // ~30/min AniList limit from Railway's datacenter IP.
    const json = await cached(
      `browse:${JSON.stringify(variables)}`,
      5 * 60_000,
      () =>
        requestWithRetry<BrowseData>(ANILIST_ENDPOINT, BROWSE_QUERY, variables)
    );

    if (json?.Page) {
      media = json.Page.media ?? [];
      hasNextPage = json.Page.pageInfo?.hasNextPage ?? false;
      currentPage = json.Page.pageInfo?.currentPage ?? page;
    }
  } catch {
    // Swallow network/parse errors — render the friendly empty state instead.
  }

  return {
    props: {
      media,
      hasNextPage,
      currentPage,
    },
  };
};

interface SelectFilterProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  allowEmpty?: boolean;
}

const SelectFilter: React.FC<SelectFilterProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Any',
  allowEmpty = true,
}) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-xs font-semibold uppercase tracking-wide text-faint">
      {label}
    </span>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-xl border border-line/70 bg-surface/60 px-3 py-2 pr-8 text-sm text-fg outline-none transition duration-200 hover:border-accent/60 focus:border-accent focus:ring-1 focus:ring-accent"
      >
        {allowEmpty && (
          <option value="" className="bg-canvas-2 text-fg">
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option
            key={opt.value}
            value={opt.value}
            className="bg-canvas-2 text-fg"
          >
            {opt.label}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint"
      >
        ▾
      </span>
    </div>
  </label>
);

const Browse = ({
  media,
  hasNextPage,
  currentPage,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  progressBar.finish();

  const q = router.query;
  const activeGenre = firstParam(q.genre);
  const activeYear = firstParam(q.year);
  const activeSeason = firstParam(q.season).toUpperCase();
  const activeFormat = firstParam(q.format).toUpperCase();
  const activeStatus = firstParam(q.status).toUpperCase();
  const activeSort = firstParam(q.sort).toUpperCase() || 'POPULARITY_DESC';

  // Push a new query, resetting to page 1 whenever a filter changes.
  const setFilter = (key: string, value: string) => {
    const next: Record<string, string> = {};

    // Carry over existing filters (except the one being changed and page).
    Object.entries(q).forEach(([k, v]) => {
      if (k === 'page' || k === key) return;
      const str = firstParam(v as string | string[] | undefined);
      if (str) next[k] = str;
    });

    if (value) next[key] = value;

    router.push({ pathname: '/browse', query: next }, undefined, {
      scroll: true,
    });
  };

  const goToPage = (target: number) => {
    const next: Record<string, string> = {};
    Object.entries(q).forEach(([k, v]) => {
      if (k === 'page') return;
      const str = firstParam(v as string | string[] | undefined);
      if (str) next[k] = str;
    });
    if (target > 1) next.page = String(target);
    router.push({ pathname: '/browse', query: next }, undefined, {
      scroll: true,
    });
  };

  const hasActiveFilters = Boolean(
    activeGenre ||
      activeYear ||
      activeSeason ||
      activeFormat ||
      activeStatus ||
      (activeSort && activeSort !== 'POPULARITY_DESC')
  );

  // Toggle a single-select chip: clicking the active value clears it.
  const toggle = (key: string, value: string, current: string) =>
    setFilter(key, current === value ? '' : value);

  return (
    <>
      <NextSeo title="Browse anime | kessoku moe" />

      <Header />

      <main className="mx-auto w-full max-w-screen-2xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        {/* Heading with accent tick */}
        <div className="mb-6 flex items-center gap-2.5">
          <span className="h-7 w-1 rounded-full bg-aurora" aria-hidden />
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            Browse
          </h1>
        </div>

        {/* Filter bar */}
        <section
          aria-label="Filters"
          className="mb-8 space-y-5 rounded-2xl border border-line/50 bg-surface/40 p-4 backdrop-blur-sm sm:p-5"
        >
          <AnimeVibeSearch />

          {/* Genre chips */}
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
              Genre
            </legend>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((genre) => {
                const active = activeGenre === genre;
                return (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => toggle('genre', genre, activeGenre)}
                    aria-pressed={active}
                    className={`rounded-full border px-3 py-1 text-xs font-medium backdrop-blur-sm transition duration-200 sm:text-sm ${
                      active
                        ? 'border-accent bg-accent text-accent-ink shadow-glow'
                        : 'border-line/70 bg-surface/60 text-muted hover:border-accent/60 hover:bg-surface-2 hover:text-fg'
                    }`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Selects row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <SelectFilter
              label="Sort"
              value={activeSort}
              onChange={(v) => setFilter('sort', v)}
              options={SORTS}
              allowEmpty={false}
            />
            <SelectFilter
              label="Year"
              value={activeYear}
              onChange={(v) => setFilter('year', v)}
              options={YEARS.map((y) => ({
                value: String(y),
                label: String(y),
              }))}
              placeholder="Any year"
            />
            <SelectFilter
              label="Season"
              value={activeSeason}
              onChange={(v) => setFilter('season', v)}
              options={SEASONS.map((s) => ({
                value: s,
                label: s.charAt(0) + s.slice(1).toLowerCase(),
              }))}
              placeholder="Any season"
            />
            <SelectFilter
              label="Format"
              value={activeFormat}
              onChange={(v) => setFilter('format', v)}
              options={FORMATS.map((f) => ({ value: f, label: f }))}
              placeholder="Any format"
            />
            <SelectFilter
              label="Status"
              value={activeStatus}
              onChange={(v) => setFilter('status', v)}
              options={STATUSES}
              placeholder="Any status"
            />
          </div>

          {hasActiveFilters && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  router.push({ pathname: '/browse' }, undefined, {
                    scroll: true,
                  })
                }
                className="rounded-full border border-line/70 bg-surface/60 px-4 py-1.5 text-xs font-medium text-muted transition duration-200 hover:border-accent/60 hover:text-fg sm:text-sm"
              >
                Clear filters
              </button>
            </div>
          )}
        </section>

        {/* Results */}
        {media.length > 0 ? (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] justify-items-center gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
              {media.map((anime) => (
                <Card key={anime.id} anime={anime as never} />
              ))}
            </div>

            {/* Pagination */}
            <nav
              aria-label="Pagination"
              className="mt-10 flex items-center justify-center gap-3"
            >
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => goToPage(currentPage - 1)}
                className="rounded-full border border-line/70 bg-surface/60 px-5 py-2 text-sm font-semibold text-fg transition duration-200 hover:border-accent/60 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line/70 disabled:hover:bg-surface/60"
              >
                Previous
              </button>
              <span className="min-w-[5rem] text-center text-sm font-medium text-muted">
                Page {currentPage}
              </span>
              <button
                type="button"
                disabled={!hasNextPage}
                onClick={() => goToPage(currentPage + 1)}
                className="rounded-full bg-aurora px-5 py-2 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:brightness-100"
              >
                Next
              </button>
            </nav>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-line/50 bg-surface/30 px-6 py-20 text-center">
            <p className="font-display text-lg font-bold text-fg">
              No anime found
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Nothing matched these filters. Try widening your search — clear a
              filter or pick a different season.
            </p>
            <button
              type="button"
              onClick={() =>
                router.push({ pathname: '/browse' }, undefined, {
                  scroll: true,
                })
              }
              className="mt-6 rounded-full bg-aurora px-5 py-2 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 hover:brightness-110"
            >
              Reset filters
            </button>
          </div>
        )}
      </main>
    </>
  );
};

export default Browse;
