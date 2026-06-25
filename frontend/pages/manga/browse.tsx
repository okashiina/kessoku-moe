import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { NextSeo } from 'next-seo';

import Header from '@components/Header';
import MangaCard from '@components/manga/Card';
import progressBar from '@components/Progress';
import { fetchMangaBrowse, MangaInfo } from '@utility/manga';
import { nsfwFromCookie } from '@utility/nsfw';

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

  const chip = (active: boolean) =>
    `inline-flex min-h-[44px] items-center rounded-full border px-3.5 text-xs font-medium backdrop-blur-sm transition duration-200 [touch-action:manipulation] active:scale-95 motion-reduce:active:scale-100 sm:text-sm ${
      active
        ? 'border-accent bg-accent text-accent-ink shadow-glow'
        : 'border-line/70 bg-surface/60 text-muted hover:border-accent/60 hover:bg-surface-2 hover:text-fg'
    }`;

  return (
    <>
      <NextSeo
        title="Browse manga by genre & tag | kessoku moe"
        description="Pick a genre or tag and dig through the catalog — isekai, revenge, found family, and more."
      />

      <Header />

      <main className="mx-auto w-full max-w-screen-2xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="h-7 w-1 rounded-full bg-aurora" aria-hidden />
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              Browse
            </h1>
            <Link href="/manga" passHref>
              <a className="ml-auto inline-flex min-h-[44px] items-center rounded-full border border-line/70 bg-surface/60 px-4 text-sm font-medium text-muted transition [touch-action:manipulation] hover:border-accent/60 hover:text-fg">
                Back to home
              </a>
            </Link>
          </div>

          <section>
            <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Genres
            </h2>
            <div className="flex flex-wrap gap-2">
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => pick('genre', g)}
                  className={chip(activeGenre === g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Popular tags
            </h2>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => pick('tag', t)}
                  className={chip(activeTag === t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </section>

          {activeLabel && (
            <section>
              <h2 className="mb-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Sort
              </h2>
              <div className="flex flex-wrap gap-2">
                {SORTS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setSort(s.value)}
                    className={chip(activeSort === s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {!activeLabel && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-line/50 bg-surface/30 px-6 py-20 text-center">
            <p className="font-display text-lg font-bold text-fg">
              Pick a genre or tag
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Tap any chip above to pull up the catalog.
            </p>
          </div>
        )}

        {activeLabel && grid && grid.media.length > 0 && (
          <>
            <p className="mb-4 text-sm text-muted">
              Showing{' '}
              <span className="font-semibold text-fg">{activeLabel}</span>
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] justify-items-center gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
              {grid.media.map((manga) => (
                <MangaCard key={manga.id} manga={manga} />
              ))}
            </div>
            <nav className="mt-10 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={grid.currentPage <= 1}
                onClick={() => goToPage(grid.currentPage - 1)}
                className="min-h-[44px] rounded-full border border-line/70 bg-surface/60 px-5 text-sm font-semibold text-fg transition [touch-action:manipulation] hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="min-w-[5rem] text-center text-sm font-medium text-muted">
                Page {grid.currentPage}
              </span>
              <button
                type="button"
                disabled={!grid.hasNextPage}
                onClick={() => goToPage(grid.currentPage + 1)}
                className="min-h-[44px] rounded-full bg-aurora px-5 text-sm font-semibold text-accent-ink shadow-glow transition [touch-action:manipulation] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                Next
              </button>
            </nav>
          </>
        )}

        {activeLabel && (!grid || grid.media.length === 0) && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-line/50 bg-surface/30 px-6 py-20 text-center">
            <p className="font-display text-lg font-bold text-fg">
              Nothing here yet
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Try another genre or tag.
            </p>
          </div>
        )}
      </main>
    </>
  );
};

export default Browse;
