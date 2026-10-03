import { useEffect, useState } from 'react';

import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Link from 'next/link';

import { SparklesIcon } from '@heroicons/react/outline';
import { NextSeo } from 'next-seo';

import CartoonPlayer from '@components/cartoon/CartoonPlayer';
import Header from '@components/Header';
import CompanionChat, {
  type CompanionSeed,
} from '@components/watch/CompanionChat';
import CompanionFab from '@components/watch/CompanionFab';
import {
  CartoonEpisode,
  CartoonShow,
  getCartoon,
  getCartoonEpisodes,
  searchCartoons,
} from '@utility/cartoon';
import {
  getCartoonProgress,
  saveCartoonEpisode,
} from '@utility/cartoonProgress';
import { getCartoonVideos } from '@utility/cartoonSources';

interface Props {
  show: CartoonShow;
  episodes: CartoonEpisode[];
  related: CartoonShow[];
  initialSeason: number;
  initialEpisode: number;
  resumeSaved: boolean;
}

const plainText = (html: string | null): string =>
  (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

export const getServerSideProps: GetServerSideProps<Props> = async ({
  params,
  query,
}) => {
  const id = Number(params?.id);
  if (!Number.isSafeInteger(id) || id < 1) return { notFound: true };
  try {
    const show = await getCartoon(id);
    if (show.type !== 'Animation') return { notFound: true };
    const [episodes, matches] = await Promise.all([
      getCartoonEpisodes(id).catch(() => []),
      searchCartoons(show.name.split(':')[0]).catch(() => []),
    ]);
    const requestedSeason = Number(query.season);
    const requestedEpisode = Number(query.episode);
    const selected =
      episodes.find(
        (item) =>
          item.season === requestedSeason && item.number === requestedEpisode
      ) || episodes.find((item) => item.number != null);
    return {
      props: {
        show,
        episodes,
        related: matches.filter((item) => item.id !== id).slice(0, 8),
        initialSeason: selected?.season || 1,
        initialEpisode: selected?.number || 1,
        resumeSaved: query.season === undefined && query.episode === undefined,
      },
    };
  } catch {
    return { notFound: true };
  }
};

const CartoonWatch = ({
  show,
  episodes,
  related,
  initialSeason,
  initialEpisode,
  resumeSaved,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [season, setSeason] = useState(initialSeason);
  const [episode, setEpisode] = useState(initialEpisode);
  const [historyReady, setHistoryReady] = useState(false);
  const [asideTab, setAsideTab] = useState<'recommended' | 'companion'>(
    'companion'
  );
  const videos = getCartoonVideos(show.id);
  const imdbId = show.externals?.imdb || null;
  const hasPlayer =
    videos.length > 0 || Boolean(imdbId && /^tt\d+$/.test(imdbId));
  useEffect(() => {
    const saved = resumeSaved ? getCartoonProgress(show.id) : undefined;
    if (
      saved &&
      (episodes.length === 0 ||
        episodes.some(
          (item) =>
            item.season === saved.season && item.number === saved.episode
        ))
    ) {
      setSeason(saved.season);
      setEpisode(saved.episode);
    }
    setHistoryReady(true);
  }, [episodes, resumeSaved, show.id]);

  useEffect(() => {
    if (historyReady && hasPlayer) saveCartoonEpisode(show, season, episode);
  }, [episode, hasPlayer, historyReady, season, show]);
  const seasons = Array.from(new Set(episodes.map((item) => item.season)))
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const seasonEpisodes = episodes.filter(
    (item) => item.season === season && item.number != null
  );
  const currentEpisode = episodes.find(
    (item) => item.season === season && item.number === episode
  );
  const episodeIndex = Math.max(
    1,
    episodes.findIndex((item) => item.id === currentEpisode?.id) + 1
  );
  const description = plainText(show.summary);
  const shortDescription =
    description.length > 500
      ? `${description.slice(0, 500).trimEnd()}…`
      : description;
  const seed: CompanionSeed = {
    title: show.name,
    synopsis: shortDescription,
    genres: show.genres || [],
    format: `Cartoon · season ${season}`,
    year: Number(show.premiered?.slice(0, 4)) || undefined,
  };
  const tabClass = (active: boolean) =>
    `inline-flex min-h-[44px] items-center gap-2 rounded-[5px] px-[17px] py-[10px] text-sm font-bold transition duration-200 [touch-action:manipulation] ${
      active
        ? 'bg-accent text-accent-ink'
        : 'text-[#bfb2c1] hover:bg-[#332735] hover:text-fg'
    }`;

  return (
    <>
      <NextSeo
        title={`${show.name} | kessoku moe`}
        description={description.slice(0, 160)}
      />
      <Header />
      <main className="mx-auto w-full max-w-[1440px] px-[5%] pb-20 pt-[30px] sm:pt-[42px]">
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8">
          <div className="min-w-0">
            {hasPlayer ? (
              <CartoonPlayer
                title={show.name}
                videos={videos}
                imdbId={imdbId}
                season={season}
                episode={episode}
              />
            ) : (
              <div className="aspect-w-16 aspect-h-9 w-full overflow-hidden rounded-2xl bg-canvas-2 shadow-card ring-1 ring-line/40">
                <div className="flex items-center justify-center p-6 text-center text-sm text-muted">
                  No video source is available for this title yet.
                </div>
              </div>
            )}

            <div className="mt-5">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-faint">
                Season {season} · Episode {episode}
                {currentEpisode ? ` · ${currentEpisode.name}` : ''}
              </p>
              <h1 className="mt-1 font-display text-2xl font-extrabold leading-tight tracking-tight text-fg sm:text-3xl">
                {show.name}
              </h1>
              <p className="mt-2 text-sm text-muted">
                {show.premiered?.slice(0, 4) || 'Year unknown'} ·{' '}
                {show.network?.name || show.webChannel?.name || 'Animation'}
                {show.rating?.average ? ` · ${show.rating.average}/10` : ''}
              </p>
            </div>

            <section className="mt-7">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-bold text-fg">
                  Episodes
                </h2>
                <span className="text-sm text-faint">
                  {episodes.length} total
                </span>
              </div>
              <div
                className="mb-3 flex flex-wrap gap-2"
                role="group"
                aria-label="Choose season"
              >
                {seasons.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setSeason(value);
                      setEpisode(
                        episodes.find(
                          (item) => item.season === value && item.number != null
                        )?.number || 1
                      );
                    }}
                    aria-pressed={value === season}
                    className={`min-h-[44px] rounded-[5px] border px-3 py-2.5 text-sm font-bold transition ${
                      value === season
                        ? 'border-transparent bg-accent text-accent-ink'
                        : 'border-[#463b49] text-[#bfb2c1] hover:bg-[#332735] hover:text-fg'
                    }`}
                  >
                    Season {value}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
                {seasonEpisodes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setEpisode(item.number || 1)}
                    aria-current={item.number === episode ? 'true' : undefined}
                    aria-label={`Season ${season}, episode ${item.number}: ${item.name}`}
                    title={item.name}
                    className={`relative flex min-h-[44px] select-none items-center justify-center rounded-[5px] text-sm font-bold tabular-nums transition duration-150 active:scale-95 ${
                      item.number === episode
                        ? 'bg-accent text-accent-ink'
                        : 'border border-[#463b49] bg-surface text-[#bfb2c1] hover:bg-[#332735] hover:text-fg'
                    }`}
                  >
                    {item.number}
                  </button>
                ))}
              </div>
            </section>

            {description && (
              <section className="mt-7">
                <h2 className="font-display text-lg font-extrabold tracking-tight text-fg">
                  Synopsis
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#bfb2c1]">
                  {shortDescription}
                </p>
              </section>
            )}
            <p className="mt-8 text-xs text-faint">
              Metadata and artwork from{' '}
              <a
                href={show.url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                TVMaze
              </a>
              .
            </p>
          </div>

          <aside className="mt-10 lg:mt-0">
            <div className="mb-3 flex gap-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setAsideTab('recommended')}
                className={tabClass(asideTab === 'recommended')}
              >
                Recommended
              </button>
              <button
                type="button"
                onClick={() => setAsideTab('companion')}
                className={tabClass(asideTab === 'companion')}
              >
                <SparklesIcon className="h-5 w-5 shrink-0" aria-hidden />
                Companion
              </button>
            </div>
            {asideTab === 'companion' ? (
              <CompanionChat
                seed={seed}
                animeId={-show.id}
                episode={episodeIndex}
                total={episodes.length}
                mediaKind="cartoon"
              />
            ) : (
              <div className="flex flex-col gap-3">
                {related.length === 0 && (
                  <p className="text-sm text-muted">No related shows found.</p>
                )}
                {related.map((item) => (
                  <Link key={item.id} href={`/cartoon/${item.id}`} passHref>
                    <a className="flex min-h-[88px] gap-3 overflow-hidden rounded-lg border border-[#463b49] bg-surface/40 p-2 transition hover:bg-surface-2">
                      {item.image?.medium && (
                        // eslint-disable-next-line @next/next/no-img-element -- TVMaze CDN thumbnail.
                        <img
                          src={item.image.medium}
                          alt=""
                          loading="lazy"
                          className="h-[72px] w-12 shrink-0 rounded object-cover"
                        />
                      )}
                      <span className="min-w-0 self-center">
                        <span className="block font-semibold text-fg">
                          {item.name}
                        </span>
                        <span className="mt-1 block text-xs text-muted">
                          {item.premiered?.slice(0, 4) || 'Cartoon'}
                        </span>
                      </span>
                    </a>
                  </Link>
                ))}
              </div>
            )}
          </aside>
        </div>
      </main>
      <CompanionFab
        seed={seed}
        animeId={-show.id}
        episode={episodeIndex}
        total={episodes.length}
        mediaKind="cartoon"
      />
    </>
  );
};

const CartoonWatchPage = (
  props: InferGetServerSidePropsType<typeof getServerSideProps>
) => (
  <CartoonWatch
    key={`${props.show.id}:${props.initialSeason}:${props.initialEpisode}:${props.resumeSaved}`}
    {...props}
  />
);

export default CartoonWatchPage;
