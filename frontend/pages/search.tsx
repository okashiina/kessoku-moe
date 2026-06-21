import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { searchAnime, searchStaff, searchStudios } from '@animeflix/api';
import {
  SearchAnimeQuery,
  SearchStaffQuery,
  SearchStudiosQuery,
} from '@animeflix/api/aniList';
import { SearchIcon } from '@heroicons/react/outline';
import { NextSeo } from 'next-seo';

import Card from '@components/anime/Card';
import Header from '@components/Header';
import MangaCard from '@components/manga/Card';
import progressBar from '@components/Progress';
import { fetchMangaBrowse, MangaInfo } from '@utility/manga';

// The lenses search supports. "anime" is the default and keeps the original
// title-grid behavior untouched.
type SearchTab = 'anime' | 'manga' | 'studios' | 'staff';

const TABS: { value: SearchTab; label: string }[] = [
  { value: 'anime', label: 'Anime' },
  { value: 'manga', label: 'Manga' },
  { value: 'studios', label: 'Studios' },
  { value: 'staff', label: 'Voice actors' },
];

interface SearchResult {
  tab: SearchTab;
  keyword: string;
  anime: SearchAnimeQuery | null;
  manga: MangaInfo[] | null;
  studios: SearchStudiosQuery | null;
  staff: SearchStaffQuery | null;
}

const firstParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? value[0] ?? '' : value ?? '';

export const getServerSideProps: GetServerSideProps<SearchResult> = async (
  context
) => {
  const keyword = firstParam(context.query.keyword);
  const requested = firstParam(context.query.type).toLowerCase();
  const tab: SearchTab = TABS.some((t) => t.value === requested)
    ? (requested as SearchTab)
    : 'anime';

  let anime: SearchAnimeQuery | null = null;
  let manga: MangaInfo[] | null = null;
  let studios: SearchStudiosQuery | null = null;
  let staff: SearchStaffQuery | null = null;

  // Only fetch the active lens — keeps each search a single AniList round-trip.
  if (tab === 'manga') {
    const result = await fetchMangaBrowse({
      page: 1,
      perPage: 20,
      search: keyword || undefined,
      sort: keyword ? ['SEARCH_MATCH'] : ['POPULARITY_DESC'],
    });
    manga = result.media;
  } else if (tab === 'studios') {
    studios = await searchStudios({ keyword, page: 1, perPage: 20 });
  } else if (tab === 'staff') {
    staff = await searchStaff({ keyword, page: 1, perPage: 20 });
  } else {
    anime = await searchAnime({ keyword, page: 1, perPage: 20 });
  }

  return {
    props: {
      tab,
      keyword,
      anime,
      manga,
      studios,
      staff,
    },
  };
};

const EmptyState: React.FC<{ keyword: string }> = ({ keyword }) => (
  <div className="mt-12 flex flex-col items-center justify-center rounded-2xl border border-line/50 bg-surface/40 px-6 py-16 text-center">
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-faint">
      <SearchIcon className="h-7 w-7" aria-hidden />
    </span>
    <h2 className="mt-5 font-display text-xl font-bold text-fg">
      No matches found
    </h2>
    <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
      We couldn&apos;t find anything for{' '}
      <span className="font-medium text-fg">&ldquo;{keyword}&rdquo;</span>. Try
      a different name, or switch tabs.
    </p>
  </div>
);

const Search = ({
  tab,
  keyword,
  anime,
  manga,
  studios,
  staff,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  progressBar.finish();

  const animeResults = anime?.Page?.media ?? [];
  const mangaResults = manga ?? [];
  const studioResults = (studios?.Page?.studios ?? []).filter(
    (s): s is NonNullable<typeof s> => Boolean(s)
  );
  const staffResults = (staff?.Page?.staff ?? []).filter(
    (s): s is NonNullable<typeof s> => Boolean(s)
  );

  const counts: Record<SearchTab, number> = {
    anime: animeResults.length,
    manga: mangaResults.length,
    studios: studioResults.length,
    staff: staffResults.length,
  };
  const count = counts[tab];
  const hasResults = count > 0;

  // Singular/plural noun for the active lens (avoids nested ternaries in JSX).
  const nounFor = (n: number): string => {
    if (tab === 'studios') return n === 1 ? 'studio' : 'studios';
    if (tab === 'staff') return n === 1 ? 'voice actor' : 'voice actors';
    return n === 1 ? 'title' : 'titles';
  };

  // Swap the active lens while holding the keyword, re-running SSR.
  const switchTab = (next: SearchTab) => {
    const query: Record<string, string> = {};
    if (keyword) query.keyword = keyword;
    if (next !== 'anime') query.type = next;
    router.push({ pathname: '/search', query }, undefined, { scroll: false });
  };

  return (
    <>
      <NextSeo title={`Results for ${keyword} | kessoku moe`} />

      <Header />

      <main className="mx-auto max-w-screen-2xl px-4 pb-16 sm:px-6 lg:px-8">
        <header className="mt-8 animate-rise">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.25em] text-accent">
            Search
          </p>
          <div className="mt-2 flex items-center gap-3">
            <span
              className="h-7 w-1 shrink-0 rounded-full bg-aurora"
              aria-hidden
            />
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg sm:text-3xl lg:text-4xl">
              Results for{' '}
              <span className="text-accent">&ldquo;{keyword}&rdquo;</span>
            </h1>
          </div>
          {hasResults && (
            <p className="mt-2 pl-4 text-sm text-muted">
              {count} {nounFor(count)} found
            </p>
          )}
        </header>

        {/* Tab switcher */}
        <div className="mt-6 flex flex-wrap gap-2">
          {TABS.map((t) => {
            const active = t.value === tab;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => switchTab(t.value)}
                aria-pressed={active}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition duration-200 ${
                  active
                    ? 'border-accent bg-accent text-accent-ink shadow-glow'
                    : 'border-line/70 bg-surface/60 text-muted hover:border-accent/60 hover:bg-surface-2 hover:text-fg'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {!hasResults && <EmptyState keyword={keyword} />}

        {/* Anime — unchanged poster grid */}
        {tab === 'anime' && hasResults && (
          <div className="mt-8 grid animate-rise grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] justify-items-center gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
            {animeResults.map((media) => (
              <Card key={media.id} anime={media} />
            ))}
          </div>
        )}

        {/* Manga — poster grid linking to /manga/{id}. Reuses the catalog
            MangaCard so covers, origin tags, and the link behave identically to
            the /manga library (the bespoke card here collapsed to no thumbnail:
            aspect-[2/3] needs the disabled core plugin). */}
        {tab === 'manga' && hasResults && (
          <div className="mt-8 grid animate-rise grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] justify-items-center gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
            {mangaResults.map((media) => (
              <MangaCard key={media.id} manga={media} />
            ))}
          </div>
        )}

        {/* Studios — linkable rows */}
        {tab === 'studios' && hasResults && (
          <div className="mt-8 grid animate-rise grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {studioResults.map((studio) => {
              const cover =
                studio.media?.nodes?.find((n) => n && n.coverImage?.medium) ??
                null;
              return (
                <Link key={studio.id} href={`/studio/${studio.id}`} passHref>
                  <a className="group flex items-center gap-3 rounded-2xl border border-line/60 bg-surface p-3 transition duration-200 hover:border-accent/60 hover:bg-surface-2">
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line/40">
                      {cover?.coverImage?.medium && (
                        <Image
                          alt={studio.name}
                          src={cover.coverImage.medium}
                          layout="fill"
                          objectFit="cover"
                        />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-display font-semibold text-fg group-hover:text-accent">
                        {studio.name}
                      </p>
                      <p className="text-xs text-faint">Studio</p>
                    </div>
                  </a>
                </Link>
              );
            })}
          </div>
        )}

        {/* Voice actors — linkable rows */}
        {tab === 'staff' && hasResults && (
          <div className="mt-8 grid animate-rise grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {staffResults.map((person) => (
              <Link key={person.id} href={`/staff/${person.id}`} passHref>
                <a className="group flex items-center gap-3 rounded-2xl border border-line/60 bg-surface p-3 transition duration-200 hover:border-accent/60 hover:bg-surface-2">
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-surface-2 ring-1 ring-line/40">
                    {person.image?.medium && (
                      <Image
                        alt={person.name?.full ?? 'Voice actor'}
                        src={person.image.medium}
                        layout="fill"
                        objectFit="cover"
                      />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-display font-semibold text-fg group-hover:text-accent">
                      {person.name?.full ?? 'Voice actor'}
                    </p>
                    {person.name?.native ? (
                      <p className="truncate text-xs text-faint">
                        {person.name.native}
                      </p>
                    ) : (
                      <p className="text-xs text-faint">Voice actor</p>
                    )}
                  </div>
                </a>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
};

export default Search;
