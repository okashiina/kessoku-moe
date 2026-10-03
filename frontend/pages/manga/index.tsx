import { useState } from 'react';

import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { ArrowLeftIcon, ArrowRightIcon } from '@heroicons/react/outline';
import { NextSeo } from 'next-seo';

import Header from '@components/Header';
import BecauseYouRead from '@components/manga/BecauseYouRead';
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

import styles from '../../styles/Browse.module.css';

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

  return (
    <div className={styles.page}>
      <NextSeo
        title="Read manga & manhwa | kessoku moe"
        description="Read manga, manhwa, and manhua in English, Indonesian, and more."
      />

      <Header />

      <main className={styles.main}>
        <div className={`${styles.heading} flex-wrap`}>
          <div className="min-w-0">
            <h1>Manga &amp; Manhwa</h1>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link href="/manga/browse" passHref>
              <a className={styles.filterToggle}>Browse</a>
            </Link>
            <Link href="/manga/downloads" passHref>
              <a className={styles.filterToggle}>Downloads</a>
            </Link>
          </div>
        </div>

        <form onSubmit={submitSearch} className="mb-4 flex max-w-xl gap-2">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search titles…"
            className="min-h-[48px] min-w-0 flex-1 rounded-[5px] border border-[#66516a] bg-surface px-4 text-base text-fg outline-none transition placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <button
            type="submit"
            className="min-h-[48px] rounded-[5px] bg-accent px-5 text-sm font-bold text-accent-ink transition hover:brightness-110"
          >
            Search
          </button>
        </form>

        <details className={styles.vibe}>
          <summary>Have a mood in mind? Try vibe search</summary>
          <VibeSearch />
        </details>

        <div className={`${styles.genres} mb-3 mt-6`}>
          {COUNTRIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => toggle('country', c.value, activeCountry)}
              aria-pressed={activeCountry === c.value}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className={styles.sorts} aria-label="Sort manga">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={activeSort === s.value}
                onClick={() => toggle('sort', s.value, activeSort)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <NsfwToggle />
        </div>

        <div className={`${styles.genres} pb-6`}>
          {GENRES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggle('genre', g, activeGenre)}
              aria-pressed={activeGenre === g}
            >
              {g}
            </button>
          ))}
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => toggle('status', s.value, activeStatus)}
              aria-pressed={activeStatus === s.value}
            >
              {s.label}
            </button>
          ))}
        </div>

        {mode === 'home' && home && (
          <>
            <ContinueReading />
            <SavedRail />
            <ForYouRail nsfw={nsfw} />
            <BecauseYouRead nsfw={nsfw} />
            <MangaSection title="Trending now" mangaList={home.trending} />
            <MangaSection title="Popular manhwa" mangaList={home.manhwa} />
            <MangaSection title="All-time popular" mangaList={home.popular} />
            <MangaSection title="Top rated" mangaList={home.topRated} />
            <MangaSection title="Fresh releases" mangaList={home.newReleases} />
          </>
        )}
        {mode === 'grid' && grid && grid.media.length > 0 && (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] justify-items-center gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
              {grid.media.map((manga) => (
                <MangaCard key={manga.id} manga={manga} />
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
        {mode === 'grid' && (!grid || grid.media.length === 0) && (
          <div className={styles.empty}>
            <h2>Nothing matched</h2>
            <p>Try a different title or clear a filter.</p>
            <button type="button" onClick={() => router.push('/manga')}>
              Reset
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default MangaLibrary;
