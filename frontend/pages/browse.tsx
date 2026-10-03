import { useEffect, useRef, useState } from 'react';

import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';

import {
  ArrowLeftIcon,
  ArrowRightIcon,
  AdjustmentsIcon,
  XIcon,
} from '@heroicons/react/outline';
import { NextSeo } from 'next-seo';

import Card from '@components/anime/Card';
import AnimeVibeSearch from '@components/anime/VibeSearch';
import WatchlistButton from '@components/anime/WatchlistButton';
import Header from '@components/Header';
import progressBar from '@components/Progress';
import { ANILIST_ENDPOINT, requestWithRetry } from '@utility/anilist';
import { cached } from '@utility/ssrCache';
import { useTitle } from '@utility/titleLang';

import styles from '../styles/Browse.module.css';

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
  bannerImage: string | null;
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
        bannerImage
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
  loadError: boolean;
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
  let loadError = false;

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
    loadError = true;
  }

  return {
    props: {
      media,
      hasNextPage,
      currentPage,
      loadError,
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
  loadError,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const featuredTitle = useTitle(media[0]?.title);
  useEffect(() => {
    progressBar.finish();
    const start = () => setLoading(true);
    const finish = () => {
      setLoading(false);
      progressBar.finish();
    };
    router.events.on('routeChangeStart', start);
    router.events.on('routeChangeComplete', finish);
    router.events.on('routeChangeError', finish);
    return () => {
      router.events.off('routeChangeStart', start);
      router.events.off('routeChangeComplete', finish);
      router.events.off('routeChangeError', finish);
    };
  }, [router.events]);

  const q = router.query;
  const activeGenre = firstParam(q.genre);
  const activeYear = firstParam(q.year);
  const activeSeason = firstParam(q.season).toUpperCase();
  const activeFormat = firstParam(q.format).toUpperCase();
  const activeStatus = firstParam(q.status).toUpperCase();
  const requestedSort = firstParam(q.sort).toUpperCase();
  const activeSort = SORTS.some((sort) => sort.value === requestedSort)
    ? requestedSort
    : 'POPULARITY_DESC';

  const setFilter = (key: string, value: string) => {
    const next: Record<string, string> = {};
    Object.entries(q).forEach(([k, v]) => {
      if (k !== 'page' && k !== key && firstParam(v)) next[k] = firstParam(v);
    });
    if (value) next[key] = value;
    router.push({ pathname: '/browse', query: next }, undefined, {
      scroll: false,
    });
  };

  const goToPage = async (target: number) => {
    const next = { ...q, page: String(target) };
    const navigated = await router.push(
      { pathname: '/browse', query: next },
      undefined,
      { scroll: false }
    );
    if (navigated) {
      resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
      resultsRef.current?.focus({ preventScroll: true });
    }
  };

  const toggle = (key: string, value: string, current: string) =>
    setFilter(key, current === value ? '' : value);
  const hasActiveFilters = Boolean(
    activeGenre ||
      activeYear ||
      activeSeason ||
      activeFormat ||
      activeStatus ||
      activeSort !== 'POPULARITY_DESC'
  );
  const activeEntries = [
    ['genre', activeGenre],
    ['year', activeYear],
    ['season', activeSeason],
    ['format', activeFormat],
    ['status', activeStatus],
  ].filter(([, value]) => Boolean(value));
  const reset = () => router.push('/browse', undefined, { scroll: false });
  const feature = media[0];
  const sortLabel =
    SORTS.find((sort) => sort.value === activeSort)?.label || 'Popularity';
  const catalogStatus = loadError
    ? 'Catalog temporarily unavailable'
    : `${media.length} titles on this page · ${sortLabel}`;
  const sortNames: Record<string, string> = {
    Popularity: 'Popular',
    Score: 'Top rated',
  };

  return (
    <div className={styles.page}>
      <NextSeo title="Browse anime | kessoku moe" />
      <Header />
      <main className={styles.main}>
        <div className={styles.heading}>
          <div>
            <h1>Find your next favorite.</h1>
            <p>A new world, a familiar comfort, or a little chaos.</p>
          </div>
          <Link href="/schedule">
            <a>
              See what&apos;s airing <ArrowRightIcon aria-hidden />
            </a>
          </Link>
        </div>
        <div className={styles.toolbar}>
          <div className={styles.sorts} aria-label="Sort anime">
            {SORTS.map((sort) => (
              <button
                key={sort.value}
                type="button"
                disabled={loading}
                aria-pressed={activeSort === sort.value}
                onClick={() => setFilter('sort', sort.value)}
              >
                {sortNames[sort.label] || sort.label}
              </button>
            ))}
          </div>
          <button
            className={styles.filterToggle}
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="browse-filters"
            onClick={() => {
              setFiltersOpen(!filtersOpen);
              if (!filtersOpen)
                requestAnimationFrame(() =>
                  document
                    .getElementById('browse-filters')
                    ?.scrollIntoView({ block: 'start', behavior: 'auto' })
                );
            }}
          >
            <AdjustmentsIcon aria-hidden />
            Filters {activeEntries.length ? `(${activeEntries.length})` : ''}
          </button>
        </div>
        <section
          id="browse-filters"
          className={styles.filters}
          hidden={!filtersOpen}
          aria-label="Filters"
        >
          <fieldset disabled={loading}>
            <legend>Pick a genre</legend>
            <div className={styles.genres}>
              {GENRES.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => toggle('genre', genre, activeGenre)}
                  aria-pressed={activeGenre === genre}
                >
                  {genre}
                </button>
              ))}
            </div>
            <div className={styles.selects}>
              <SelectFilter
                label="Year"
                value={activeYear}
                onChange={(v) => setFilter('year', v)}
                options={YEARS.map((year) => ({
                  value: String(year),
                  label: String(year),
                }))}
                placeholder="Any year"
              />
              <SelectFilter
                label="Season"
                value={activeSeason}
                onChange={(v) => setFilter('season', v)}
                options={SEASONS.map((season) => ({
                  value: season,
                  label: season.charAt(0) + season.slice(1).toLowerCase(),
                }))}
                placeholder="Any season"
              />
              <SelectFilter
                label="Format"
                value={activeFormat}
                onChange={(v) => setFilter('format', v)}
                options={FORMATS.map((format) => ({
                  value: format,
                  label: format,
                }))}
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
          </fieldset>
          <details className={styles.vibe}>
            <summary>Have a mood in mind? Try vibe search</summary>
            <AnimeVibeSearch />
          </details>
        </section>
        <div ref={resultsRef} tabIndex={-1} className={styles.resultHeader}>
          <div>
            <h2>{activeGenre || 'The anime lineup'}</h2>
            <p role="status">
              {loading ? 'Finding your lineup…' : catalogStatus}
            </p>
          </div>
          {hasActiveFilters && (
            <div className={styles.activeFilters}>
              {activeEntries.map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  disabled={loading}
                  onClick={() => setFilter(key, '')}
                  aria-label={`Remove ${key} filter: ${value}`}
                >
                  {value}
                  <XIcon aria-hidden />
                </button>
              ))}
              <button type="button" disabled={loading} onClick={reset}>
                Clear all
              </button>
            </div>
          )}
        </div>
        <div aria-busy={loading} className={loading ? styles.busy : undefined}>
          {feature ? (
            <>
              <div className={styles.grid}>
                <article className={styles.feature}>
                  <div className={styles.featureArt}>
                    <Link href={`/anime/${feature.id}`}>
                      <a aria-label={`View ${featuredTitle}`}>
                        {(feature.bannerImage ||
                          feature.coverImage.large ||
                          feature.coverImage.medium) && (
                          <Image
                            src={
                              feature.bannerImage ||
                              feature.coverImage.large ||
                              feature.coverImage.medium ||
                              ''
                            }
                            alt={`Artwork for ${featuredTitle}`}
                            layout="fill"
                            objectFit="cover"
                            sizes="(max-width: 639px) 90vw, (max-width: 1023px) 60vw, 40vw"
                            priority
                          />
                        )}
                      </a>
                    </Link>
                    <span>
                      {activeGenre
                        ? `${activeGenre.toUpperCase()} SPOTLIGHT`
                        : 'FIRST ON THE LINEUP'}
                    </span>
                    <div className={styles.featureSave}>
                      <WatchlistButton
                        id={feature.id}
                        className="!h-11 !w-11"
                      />
                    </div>
                  </div>
                  <h3>
                    <Link href={`/anime/${feature.id}`}>
                      <a>{featuredTitle}</a>
                    </Link>
                  </h3>
                  <p>
                    {[
                      feature.format,
                      feature.seasonYear,
                      feature.meanScore ? `${feature.meanScore}% score` : null,
                      ...(feature.genres || []).slice(0, 2),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </article>
                {media.slice(1).map((anime) => (
                  <Card key={anime.id} anime={anime as never} fluid />
                ))}
              </div>
              <nav className={styles.pagination} aria-label="Pagination">
                <button
                  type="button"
                  disabled={loading || currentPage <= 1}
                  onClick={() => goToPage(currentPage - 1)}
                >
                  <ArrowLeftIcon aria-hidden />
                  Previous
                </button>
                <span>Page {currentPage}</span>
                <button
                  type="button"
                  disabled={loading || !hasNextPage}
                  onClick={() => goToPage(currentPage + 1)}
                >
                  Next page
                  <ArrowRightIcon aria-hidden />
                </button>
              </nav>
            </>
          ) : (
            <div className={styles.empty}>
              <h2>
                {loadError
                  ? 'The lineup is taking a break.'
                  : 'No matches this time.'}
              </h2>
              <p>
                {loadError
                  ? 'We could not reach the anime catalog. Your filters are still here. Give it another try.'
                  : 'Try another genre or remove a filter to give more stories a chance.'}
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={
                  loadError
                    ? () =>
                        router.replace(router.asPath, undefined, {
                          scroll: false,
                        })
                    : reset
                }
              >
                {loadError ? 'Try again' : 'Reset filters'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Browse;
