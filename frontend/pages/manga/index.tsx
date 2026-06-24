import { useState } from 'react';

import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { NextSeo } from 'next-seo';

import Header from '@components/Header';
import MangaCard from '@components/manga/Card';
import ContinueReading from '@components/manga/ContinueReading';
import ForYouRail from '@components/manga/ForYouRail';
import NsfwToggle from '@components/manga/NsfwToggle';
import SavedRail from '@components/manga/SavedRail';
import MangaSection from '@components/manga/Section';
import VibeSearch from '@components/manga/VibeSearch';
import progressBar from '@components/Progress';
import {
  fetchMangaBrowse,
  fetchMangaHome,
  MangaHome,
  MangaInfo,
} from '@utility/manga';
import { nsfwFromCookie } from '@utility/nsfw';

const GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Supernatural',
  'Thriller',
];

const COUNTRIES = [
  { value: 'JP', label: 'Manga' },
  { value: 'KR', label: 'Manhwa' },
  { value: 'CN', label: 'Manhua' },
];

const STATUSES = [
  { value: 'RELEASING', label: 'Releasing' },
  { value: 'FINISHED', label: 'Finished' },
];

const SORTS = [
  { value: 'POPULARITY_DESC', label: 'Popularity' },
  { value: 'SCORE_DESC', label: 'Score' },
  { value: 'TRENDING_DESC', label: 'Trending' },
];

const PER_PAGE = 30;

const firstParam = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? v[0] ?? '' : v ?? '';

interface MangaIndexProps {
  mode: 'home' | 'grid';
  nsfw: boolean;
  home: MangaHome | null;
  grid: {
    media: MangaInfo[];
    hasNextPage: boolean;
    currentPage: number;
  } | null;
}

export const getServerSideProps: GetServerSideProps<MangaIndexProps> = async ({
  query,
  req,
}) => {
  const nsfw = nsfwFromCookie(req.headers.cookie);
  const search = firstParam(query.q);
  const genre = firstParam(query.genre);
  const country = firstParam(query.country).toUpperCase();
  const status = firstParam(query.status).toUpperCase();
  const sort = firstParam(query.sort).toUpperCase();
  const page = Math.max(1, parseInt(firstParam(query.page), 10) || 1);

  const isFiltered = Boolean(search || genre || country || status || sort);

  if (!isFiltered) {
    const home = await fetchMangaHome(nsfw);
    return { props: { mode: 'home', nsfw, home, grid: null } };
  }

  const variables: Record<string, unknown> = {
    page,
    perPage: PER_PAGE,
    sort: [SORTS.some((s) => s.value === sort) ? sort : 'POPULARITY_DESC'],
  };
  if (search) variables.search = search;
  if (GENRES.includes(genre)) variables.genre_in = [genre];
  if (COUNTRIES.some((c) => c.value === country))
    variables.countryOfOrigin = country;
  if (STATUSES.some((s) => s.value === status)) variables.status = status;

  const grid = await fetchMangaBrowse(variables, nsfw);
  return { props: { mode: 'grid', nsfw, home: null, grid } };
};

const MangaLibrary = ({
  mode,
  nsfw,
  home,
  grid,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();
  progressBar.finish();

  const q = router.query;
  const [searchInput, setSearchInput] = useState(firstParam(q.q));
  const activeGenre = firstParam(q.genre);
  const activeCountry = firstParam(q.country).toUpperCase();
  const activeStatus = firstParam(q.status).toUpperCase();
  const activeSort = firstParam(q.sort).toUpperCase();

  const setFilter = (key: string, value: string) => {
    const next: Record<string, string> = {};
    Object.entries(q).forEach(([k, v]) => {
      if (k === 'page' || k === key) return;
      const str = firstParam(v as string | string[] | undefined);
      if (str) next[k] = str;
    });
    if (value) next[key] = value;
    router.push({ pathname: '/manga', query: next }, undefined, {
      scroll: true,
    });
  };

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilter('q', searchInput.trim());
  };

  const toggle = (key: string, value: string, current: string) =>
    setFilter(key, current === value ? '' : value);

  const goToPage = (target: number) => {
    const next: Record<string, string> = {};
    Object.entries(q).forEach(([k, v]) => {
      if (k === 'page') return;
      const str = firstParam(v as string | string[] | undefined);
      if (str) next[k] = str;
    });
    if (target > 1) next.page = String(target);
    router.push({ pathname: '/manga', query: next }, undefined, {
      scroll: true,
    });
  };

  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition duration-200 [touch-action:manipulation] sm:text-sm ${
      active
        ? 'border-accent bg-accent text-accent-ink shadow-glow'
        : 'border-line/70 bg-surface/60 text-muted hover:border-accent/60 hover:bg-surface-2 hover:text-fg'
    }`;

  return (
    <>
      <NextSeo
        title="Read manga & manhwa | kessoku moe"
        description="Read manga, manhwa, and manhua in English, Indonesian, and more."
      />

      <Header />

      <main className="mx-auto w-full max-w-screen-2xl pb-20 pt-6">
        <div className="mb-6 flex flex-col gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="h-7 w-1 rounded-full bg-aurora" aria-hidden />
            <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              Manga &amp; Manhwa
            </h1>
            <Link href="/manga/downloads" passHref>
              <a className="ml-auto inline-flex min-h-[44px] items-center rounded-full border border-line/70 bg-surface/60 px-4 text-sm font-medium text-muted transition [touch-action:manipulation] hover:border-accent/60 hover:text-fg">
                Downloads
              </a>
            </Link>
          </div>

          {/* Search */}
          <form onSubmit={submitSearch} className="flex max-w-xl gap-2">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search titles…"
              className="min-w-0 flex-1 rounded-xl border border-line/70 bg-surface/60 px-4 py-2 text-base text-fg outline-none transition placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent sm:text-sm"
            />
            <button
              type="submit"
              className="rounded-xl bg-aurora px-4 py-2 text-sm font-semibold text-accent-ink shadow-glow transition hover:brightness-110"
            >
              Search
            </button>
          </form>

          {/* AI vibe-search: describe a mood, get matching titles */}
          <VibeSearch />

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {COUNTRIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => toggle('country', c.value, activeCountry)}
                className={chip(activeCountry === c.value)}
              >
                {c.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-line/60" aria-hidden />
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => toggle('sort', s.value, activeSort)}
                className={chip(activeSort === s.value)}
              >
                {s.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-line/60" aria-hidden />
            <NsfwToggle />
          </div>

          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => toggle('genre', g, activeGenre)}
                className={chip(activeGenre === g)}
              >
                {g}
              </button>
            ))}
            {STATUSES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => toggle('status', s.value, activeStatus)}
                className={chip(activeStatus === s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {mode === 'home' && home && (
          <>
            <ContinueReading />
            <SavedRail />
            <ForYouRail nsfw={nsfw} />
            <MangaSection title="Trending now" mangaList={home.trending} />
            <MangaSection title="Popular manhwa" mangaList={home.manhwa} />
            <MangaSection title="All-time popular" mangaList={home.popular} />
            <MangaSection title="Top rated" mangaList={home.topRated} />
            <MangaSection title="Fresh releases" mangaList={home.newReleases} />
          </>
        )}
        {mode === 'grid' && grid && grid.media.length > 0 && (
          <div className="px-4 sm:px-6 lg:px-8">
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
                className="rounded-full border border-line/70 bg-surface/60 px-5 py-2 text-sm font-semibold text-fg transition hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-40"
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
                className="rounded-full bg-aurora px-5 py-2 text-sm font-semibold text-accent-ink shadow-glow transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                Next
              </button>
            </nav>
          </div>
        )}
        {mode === 'grid' && (!grid || grid.media.length === 0) && (
          <div className="mx-4 flex flex-col items-center justify-center rounded-2xl border border-line/50 bg-surface/30 px-6 py-20 text-center sm:mx-6 lg:mx-8">
            <p className="font-display text-lg font-bold text-fg">
              Nothing matched
            </p>
            <p className="mt-2 max-w-sm text-sm text-muted">
              Try a different title or clear a filter.
            </p>
            <button
              type="button"
              onClick={() => router.push('/manga')}
              className="mt-6 rounded-full bg-aurora px-5 py-2 text-sm font-semibold text-accent-ink shadow-glow transition hover:brightness-110"
            >
              Reset
            </button>
          </div>
        )}
      </main>
    </>
  );
};

export default MangaLibrary;
