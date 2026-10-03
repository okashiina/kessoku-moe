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
import { NextSeo } from 'next-seo';

import Card from '@components/anime/Card';
import Header from '@components/Header';
import MangaCard from '@components/manga/Card';
import progressBar from '@components/Progress';
import { CartoonShow, searchCartoons } from '@utility/cartoon';
import { fetchMangaBrowse, MangaInfo } from '@utility/manga';
import { nsfwFromCookie } from '@utility/nsfw';

// The default view searches all three catalogs; individual tabs narrow the results.
type SearchTab = 'all' | 'anime' | 'manga' | 'cartoon' | 'studios' | 'staff';

const TABS: { value: SearchTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'anime', label: 'Anime' },
  { value: 'manga', label: 'Manga' },
  { value: 'cartoon', label: 'Cartoons' },
  { value: 'studios', label: 'Studios' },
  { value: 'staff', label: 'Voice actors' },
];

interface SearchResult {
  tab: SearchTab;
  keyword: string;
  anime: SearchAnimeQuery | null;
  manga: MangaInfo[] | null;
  cartoons: CartoonShow[];
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
    : 'all';

  let anime: SearchAnimeQuery | null = null;
  let manga: MangaInfo[] | null = null;
  let cartoons: CartoonShow[] = [];
  let studios: SearchStudiosQuery | null = null;
  let staff: SearchStaffQuery | null = null;

  if (tab === 'all') {
    const results = await Promise.allSettled([
      searchAnime({ keyword, page: 1, perPage: 20 }),
      fetchMangaBrowse(
        {
          page: 1,
          perPage: 20,
          search: keyword || undefined,
          sort: keyword ? ['SEARCH_MATCH'] : ['POPULARITY_DESC'],
        },
        nsfwFromCookie(context.req.headers.cookie)
      ),
      searchCartoons(keyword),
    ]);
    const [animeResult, mangaResult, cartoonResult] = results;
    anime = animeResult.status === 'fulfilled' ? animeResult.value : null;
    manga = mangaResult.status === 'fulfilled' ? mangaResult.value.media : null;
    cartoons = cartoonResult.status === 'fulfilled' ? cartoonResult.value : [];
  } else if (tab === 'cartoon') {
    cartoons = await searchCartoons(keyword).catch(() => []);
  } else if (tab === 'manga') {
    // Gate adult titles on the manga lens to match /manga browse: SFW unless the
    // reader's NSFW cookie is set.
    const nsfw = nsfwFromCookie(context.req.headers.cookie);
    const result = await fetchMangaBrowse(
      {
        page: 1,
        perPage: 20,
        search: keyword || undefined,
        sort: keyword ? ['SEARCH_MATCH'] : ['POPULARITY_DESC'],
      },
      nsfw
    );
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
      cartoons,
      studios,
      staff,
    },
  };
};

const EmptyState: React.FC<{ keyword: string }> = ({ keyword }) => (
  <div className="mt-12 flex min-h-[340px] flex-col items-center justify-center gap-4 text-center">
    <h2 className="font-display text-[26px] font-extrabold text-fg">
      No matches found
    </h2>
    <p className="max-w-[420px] leading-[1.7] text-[#bfb2c1]">
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
  cartoons,
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
    all: animeResults.length + mangaResults.length + cartoons.length,
    anime: animeResults.length,
    manga: mangaResults.length,
    cartoon: cartoons.length,
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
    if (next !== 'all') query.type = next;
    router.push({ pathname: '/search', query }, undefined, { scroll: false });
  };

  return (
    <>
      <NextSeo title={`Results for ${keyword} | kessoku moe`} />

      <Header />

      <main className="mx-auto max-w-screen-2xl px-4 pb-16 sm:px-6 lg:px-8">
        <header className="mt-8 animate-rise">
          <h1 className="font-display text-[clamp(32px,4vw,52px)] font-extrabold tracking-[-0.05em] text-fg">
            Results for{' '}
            <span className="text-accent [overflow-wrap:anywhere]">
              &ldquo;{keyword}&rdquo;
            </span>
          </h1>
          {hasResults && (
            <p className="mt-3 text-[15px] text-[#bfb2c1]">
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
                className={`min-h-[44px] rounded-[5px] px-[17px] py-[10px] text-sm font-bold transition duration-200 ${
                  active
                    ? 'bg-accent text-accent-ink hover:bg-accent hover:text-accent-ink'
                    : 'text-[#bfb2c1] hover:bg-[#332735] hover:text-fg'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {!hasResults && <EmptyState keyword={keyword} />}

        {/* Anime — poster grid */}
        {(tab === 'all' || tab === 'anime') && animeResults.length > 0 && (
          <section className="mt-8">
            {tab === 'all' && (
              <h2 className="mb-5 font-display text-2xl font-bold">Anime</h2>
            )}
            <div className="grid animate-rise grid-cols-2 gap-[22px] sm:grid-cols-3 lg:grid-cols-5">
              {animeResults.map((media) => (
                <Card key={media.id} anime={media} fluid />
              ))}
            </div>
          </section>
        )}

        {/* Manga — poster grid linking to /manga/{id}. Reuses the catalog
            MangaCard so covers, origin tags, and the link behave identically to
            the /manga library (the bespoke card here collapsed to no thumbnail:
            aspect-[2/3] needs the disabled core plugin). */}
        {(tab === 'all' || tab === 'manga') && mangaResults.length > 0 && (
          <section className="mt-10">
            {tab === 'all' && (
              <h2 className="mb-5 font-display text-2xl font-bold">Manga</h2>
            )}
            <div className="grid animate-rise grid-cols-2 justify-items-center gap-[22px] sm:grid-cols-3 lg:grid-cols-5">
              {mangaResults.map((media) => (
                <MangaCard key={media.id} manga={media} />
              ))}
            </div>
          </section>
        )}

        {(tab === 'all' || tab === 'cartoon') && cartoons.length > 0 && (
          <section className="mt-10">
            {tab === 'all' && (
              <h2 className="mb-5 font-display text-2xl font-bold">Cartoons</h2>
            )}
            <div className="grid grid-cols-2 gap-[22px] sm:grid-cols-3 lg:grid-cols-5">
              {cartoons.map((show) => (
                <Link key={show.id} href={`/cartoon/${show.id}`} passHref>
                  <a className="group min-w-0">
                    <div className="aspect-w-2 aspect-h-3 overflow-hidden rounded-xl bg-surface-2">
                      {show.image?.medium ? (
                        // eslint-disable-next-line @next/next/no-img-element -- TVMaze serves resized cover art.
                        <img
                          src={show.image.medium}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex items-center justify-center p-4 text-center text-sm font-bold">
                          {show.name}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-3 text-sm font-bold group-hover:text-accent">
                      {show.name}
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      Cartoon
                      {show.premiered ? ` · ${show.premiered.slice(0, 4)}` : ''}
                    </p>
                  </a>
                </Link>
              ))}
            </div>
          </section>
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
                  <a className="group flex min-h-[44px] items-center gap-3 rounded-lg border border-[#463b49] bg-surface p-3 transition duration-200">
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
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
                <a className="group flex min-h-[44px] items-center gap-3 rounded-lg border border-[#463b49] bg-surface p-3 transition duration-200">
                  <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-surface-2">
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
