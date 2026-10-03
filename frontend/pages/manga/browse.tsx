import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/outline';
import { NextSeo } from 'next-seo';

import Header from '@components/Header';
import MangaCard from '@components/manga/Card';
import progressBar from '@components/Progress';
import { fetchMangaBrowse, MangaInfo } from '@utility/manga';
import { nsfwFromCookie } from '@utility/nsfw';

import styles from '../../styles/MangaBrowse.module.css';

// Browse by genre or tag. Genres use AniList's `genre_in`; the curated tag set
// uses the new `tag_in` arg on browseQuery. One filter at a time keeps the URL
// (and the grid query) simple — pick a chip, see a grid. NSFW is gated at SSR
// from the cookie so adult titles never reach a SFW client.

// AniList's canonical manga genres (the full set; the home page shows a subset).
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

// A hand-picked set of high-signal AniList tags readers actually browse by.
// These are real AniList tag names (case + spelling matter for `tag_in`).
const TAGS = [
  'Isekai',
  'Time Travel',
  'Revenge',
  'Female Protagonist',
  'Male Protagonist',
  'Anti-Hero',
  'Demons',
  'Magic',
  'Martial Arts',
  'School',
  'Military',
  'Post-Apocalyptic',
  'Survival',
  'Found Family',
  'Cooking',
  'Reincarnation',
  'Office Lady',
  'Royal Affairs',
  'Gods',
  'Dungeon',
];

const SORTS = [
  { value: 'POPULARITY_DESC', label: 'Popular' },
  { value: 'SCORE_DESC', label: 'Top rated' },
  { value: 'TRENDING_DESC', label: 'Trending' },
];

const PER_PAGE = 30;

const firstParam = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? v[0] ?? '' : v ?? '';

interface BrowseProps {
  nsfw: boolean;
  activeGenre: string;
  activeTag: string;
  activeSort: string;
  page: number;
  grid: {
    media: MangaInfo[];
    hasNextPage: boolean;
    currentPage: number;
  } | null;
}

export const getServerSideProps: GetServerSideProps<BrowseProps> = async ({
  query,
  req,
}) => {
  const nsfw = nsfwFromCookie(req.headers.cookie);
  const genre = firstParam(query.genre);
  const tag = firstParam(query.tag);
  const sort = firstParam(query.sort).toUpperCase();
  const page = Math.max(1, parseInt(firstParam(query.page), 10) || 1);

  const activeGenre = GENRES.includes(genre) ? genre : '';
  const activeTag = TAGS.includes(tag) ? tag : '';
  const activeSort = SORTS.some((s) => s.value === sort)
    ? sort
    : 'POPULARITY_DESC';

  // Nothing chosen yet → show the chip picker, skip the AniList round-trip.
  if (!activeGenre && !activeTag) {
    return {
      props: { nsfw, activeGenre, activeTag, activeSort, page, grid: null },
    };
  }

  const variables: Record<string, unknown> = {
    page,
    perPage: PER_PAGE,
    sort: [activeSort],
  };
  if (activeGenre) variables.genre_in = [activeGenre];
  if (activeTag) variables.tag_in = [activeTag];

  const grid = await fetchMangaBrowse(variables, nsfw);
  return {
    props: { nsfw, activeGenre, activeTag, activeSort, page, grid },
  };
};

const Browse = ({
  activeGenre,
  activeTag,
  activeSort,
  grid,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();
  progressBar.finish();

  const activeLabel = activeGenre || activeTag;
  const sortLabel =
    SORTS.find((s) => s.value === activeSort)?.label || 'Popular';

  // Pick a single genre or tag (toggling off the active one), resetting paging.
  const pick = (key: 'genre' | 'tag', value: string) => {
    const isActive =
      (key === 'genre' && activeGenre === value) ||
      (key === 'tag' && activeTag === value);
    const next: Record<string, string> = {};
    if (!isActive) {
      next[key] = value;
      if (activeSort) next.sort = activeSort;
    }
    router.push({ pathname: '/manga/browse', query: next }, undefined, {
      scroll: true,
    });
  };

  const setSort = (value: string) => {
    const next: Record<string, string> = { sort: value };
    if (activeGenre) next.genre = activeGenre;
    if (activeTag) next.tag = activeTag;
    router.push({ pathname: '/manga/browse', query: next }, undefined, {
      scroll: true,
    });
  };

  const goToPage = (target: number) => {
    const next: Record<string, string> = {};
    if (activeGenre) next.genre = activeGenre;
    if (activeTag) next.tag = activeTag;
    if (activeSort) next.sort = activeSort;
    if (target > 1) next.page = String(target);
    router.push({ pathname: '/manga/browse', query: next }, undefined, {
      scroll: true,
    });
  };

  const clearFilter = () => {
    router.push('/manga/browse', undefined, { scroll: true });
  };

  return (
    <div className={styles.page}>
      <NextSeo
        title="Browse manga by genre & tag | kessoku moe"
        description="Pick a genre or tag and dig through the catalog — isekai, revenge, found family, and more."
      />

      <Header />

      <main className={styles.main}>
        <div className={styles.heading}>
          <div>
            <h1>Browse the catalog.</h1>
            <p>Genres, tags, and everything in between.</p>
          </div>
          <Link href="/manga">
            <a>
              <ArrowLeftIcon aria-hidden />
              Back to home
            </a>
          </Link>
        </div>

        <section className={styles.filters} aria-label="Browse filters">
          <fieldset>
            <legend>Genres</legend>
            <div className={styles.chips}>
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => pick('genre', g)}
                  aria-pressed={activeGenre === g}
                >
                  {g}
                </button>
              ))}
            </div>
            <legend>Popular tags</legend>
            <div className={styles.chips}>
              {TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => pick('tag', t)}
                  aria-pressed={activeTag === t}
                >
                  {t}
                </button>
              ))}
            </div>
          </fieldset>
        </section>

        {activeLabel && (
          <div className={styles.toolbar}>
            <div className={styles.sorts} aria-label="Sort manga">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={activeSort === s.value}
                  onClick={() => setSort(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!activeLabel && (
          <div className={styles.empty}>
            <h2>Pick a genre or tag</h2>
            <p>Tap any chip above to pull up the catalog.</p>
          </div>
        )}

        {activeLabel && grid && grid.media.length > 0 && (
          <>
            <div className={styles.resultHeader}>
              <div>
                <h2>{activeLabel}</h2>
                <p role="status">
                  {grid.media.length} titles on this page · {sortLabel}
                </p>
              </div>
              <button
                type="button"
                className={styles.clearFilter}
                onClick={clearFilter}
              >
                Clear filter
              </button>
            </div>
            <div className={styles.grid}>
              {grid.media.map((manga) => (
                <MangaCard key={manga.id} manga={manga} fluid />
              ))}
            </div>
            <nav className={styles.pagination} aria-label="Pagination">
              <button
                type="button"
                disabled={grid.currentPage <= 1}
                onClick={() => goToPage(grid.currentPage - 1)}
              >
                <ArrowLeftIcon aria-hidden />
                Previous
              </button>
              <span>Page {grid.currentPage}</span>
              <button
                type="button"
                disabled={!grid.hasNextPage}
                onClick={() => goToPage(grid.currentPage + 1)}
              >
                Next page
                <ArrowRightIcon aria-hidden />
              </button>
            </nav>
          </>
        )}

        {activeLabel && (!grid || grid.media.length === 0) && (
          <div className={styles.empty}>
            <h2>Nothing here yet</h2>
            <p>Try another genre or tag to find something worth reading.</p>
            <button type="button" onClick={clearFilter}>
              Browse all filters
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default Browse;
