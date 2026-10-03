import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Link from 'next/link';

import { NextSeo } from 'next-seo';

import CartoonContinueWatching from '@components/cartoon/CartoonContinueWatching';
import CartoonHomeSections from '@components/cartoon/CartoonHomeSections';
import CartoonSpotlight, {
  pickCartoonSpotlights,
} from '@components/cartoon/CartoonSpotlight';
import Footer from '@components/Footer';
import Header from '@components/Header';
import {
  CartoonShow,
  getCartoonCatalogPage,
  searchCartoons,
} from '@utility/cartoon';
import { getCartoonVideos } from '@utility/cartoonSources';

interface Props {
  shows: CartoonShow[];
  query: string;
  page: number;
  hasMore: boolean;
  unavailable: boolean;
  browse: boolean;
  genre: string;
}

export const getServerSideProps: GetServerSideProps<Props> = async ({
  query,
}) => {
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 80) : '';
  const genre =
    typeof query.genre === 'string' ? query.genre.trim().slice(0, 40) : '';
  const requestedPage = Number(query.page);
  const page =
    !q && Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? Math.min(requestedPage, 999)
      : 0;
  const browse = query.view === 'browse' || Boolean(q || genre) || page > 0;
  const filterGenre = (items: CartoonShow[]) =>
    genre
      ? items.filter((show) =>
          show.genres.some(
            (value) => value.toLowerCase() === genre.toLowerCase()
          )
        )
      : items;
  try {
    if (q) {
      const shows = await searchCartoons(q);
      return {
        props: {
          shows: filterGenre(shows),
          query: q,
          page: 0,
          hasMore: false,
          unavailable: false,
          browse,
          genre,
        },
      };
    }
    const { shows, hasMore } = await getCartoonCatalogPage(page);
    return {
      props: {
        shows: filterGenre(shows),
        query: '',
        page,
        hasMore,
        unavailable: false,
        browse,
        genre,
      },
    };
  } catch {
    return {
      props: {
        shows: [],
        query: q,
        page,
        hasMore: false,
        unavailable: true,
        browse,
        genre,
      },
    };
  }
};

const CartoonIndex = ({
  shows,
  query,
  page,
  hasMore,
  unavailable,
  browse,
  genre,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const landing = !browse && !unavailable && shows.length > 0;
  const spotlights = landing ? pickCartoonSpotlights(shows) : [];
  const catalogTitle = genre ? `${genre} cartoons` : 'Browse cartoons';
  const catalogHref = (targetPage: number) => {
    const params = new URLSearchParams({ view: 'browse' });
    if (genre) params.set('genre', genre);
    if (targetPage > 0) params.set('page', String(targetPage));
    return `/cartoon?${params.toString()}`;
  };
  let results = (
    <p className="text-muted">
      No matching animated series. Try another title.
    </p>
  );
  if (unavailable) {
    results = (
      <p role="status" className="text-muted">
        The cartoon catalog is temporarily unavailable. Please try again.
      </p>
    );
  } else if (shows.length > 0) {
    results = (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:gap-6">
        {shows.map((show) => (
          <Link key={show.id} href={`/cartoon/${show.id}`} passHref>
            <a className="group min-w-0 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              <div className="aspect-w-2 aspect-h-3 relative overflow-hidden rounded-xl bg-surface-2">
                <div>
                  <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#3a2940] via-[#26202c] to-[#17141c] p-5 text-center font-display text-xl font-bold leading-tight text-fg/70">
                    {show.name}
                  </span>
                  {show.image?.medium && (
                    // eslint-disable-next-line @next/next/no-img-element -- TVMaze CDN images are already resized.
                    <img
                      src={show.image.medium}
                      alt=""
                      loading="lazy"
                      className="relative z-10 h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  )}
                  {(getCartoonVideos(show.id).length > 0 ||
                    /^tt\d+$/.test(show.externals?.imdb || '')) && (
                    <span className="absolute bottom-2 left-2 z-20 rounded-lg bg-accent px-2 py-1 text-xs font-bold text-canvas">
                      {getCartoonVideos(show.id).length > 0
                        ? 'Official video'
                        : 'Episode source'}
                    </span>
                  )}
                </div>
              </div>
              <h3 className="mt-3 truncate font-semibold group-hover:text-accent">
                {show.name}
              </h3>
              <p className="mt-1 text-xs text-muted">
                {show.premiered?.slice(0, 4) || 'Year unknown'} ·{' '}
                {show.genres?.slice(0, 2).join(' / ') || 'Animation'}
              </p>
            </a>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-fg">
      <NextSeo
        title="General Cartoon | kessoku moe"
        description="Browse animated series, episode guides, and available streams."
      />
      <Header />
      <main className="mx-auto max-w-screen-2xl px-4 pb-20 pt-7 sm:px-6 lg:px-8">
        {landing && <CartoonSpotlight shows={spotlights} />}
        {!browse && <CartoonContinueWatching />}
        {landing && <CartoonHomeSections shows={shows} />}
        {!landing && (
          <>
            <div
              id="cartoon-catalog"
              className="mb-6 mt-12 flex scroll-mt-28 flex-wrap items-end justify-between gap-3"
            >
              <h1 className="min-w-0 flex-1 font-display text-2xl font-bold [overflow-wrap:anywhere]">
                {query ? `Results for “${query}”` : catalogTitle}
              </h1>
              {browse && (
                <Link href="/cartoon">
                  <a className="inline-flex min-h-[44px] shrink-0 items-center px-2 text-sm font-semibold text-accent">
                    Back to featured
                  </a>
                </Link>
              )}
            </div>
            {!query && !unavailable && (
              <p className="mb-5 text-sm text-muted">
                Page {page + 1} · {shows.length} animated series
              </p>
            )}
            {results}
            {!query && !unavailable && (page > 0 || hasMore) && (
              <nav
                aria-label="Cartoon catalog pages"
                className="mt-10 flex items-center justify-center gap-3"
              >
                {page > 0 && (
                  <Link href={catalogHref(page - 1)} passHref>
                    <a className="min-h-[44px] rounded-lg border border-line px-5 py-3 text-sm font-bold text-fg hover:border-accent">
                      Previous
                    </a>
                  </Link>
                )}
                <span className="px-2 text-sm text-muted">Page {page + 1}</span>
                {hasMore && (
                  <Link href={catalogHref(page + 1)} passHref>
                    <a className="min-h-[44px] rounded-lg bg-accent px-5 py-3 text-sm font-bold text-canvas hover:opacity-90">
                      More cartoons
                    </a>
                  </Link>
                )}
              </nav>
            )}
          </>
        )}
        <p className="mt-12 text-xs text-muted">
          Metadata and artwork from{' '}
          <a
            className="underline"
            href="https://www.tvmaze.com/api"
            target="_blank"
            rel="noreferrer"
          >
            TVMaze
          </a>
          .
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default CartoonIndex;
