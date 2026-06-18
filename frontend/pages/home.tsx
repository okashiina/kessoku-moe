import { InferGetServerSidePropsType } from 'next';
import Link from 'next/link';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { ArrowRightIcon } from '@heroicons/react/outline';
import { NextSeo } from 'next-seo';

import AiringCard from '@components/anime/AiringCard';
import ContinueWatchingRail from '@components/anime/ContinueWatchingRail';
import MyListRail from '@components/anime/MyListRail';
import RecommendationRails from '@components/anime/RecommendationRails';
import Section from '@components/anime/Section';
import Spotlight from '@components/anime/Spotlight';
import WatchLaterRail from '@components/anime/WatchLaterRail';
import Footer from '@components/Footer';
import Header from '@components/Header';
import Reveal from '@components/motion/Reveal';
import progressBar from '@components/Progress';
import { fetchHomeData } from '@utility/anilist';

// MediaInfo from our inline query is structurally what Card/Section read; cast
// at the boundary (browse.tsx uses the same trick).
const asCards = (media: unknown) => media as AnimeInfoFragment[];

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

export const getServerSideProps = async () => {
  const data = await fetchHomeData();
  return { props: { ...data } };
};

const RailHeading: React.FC<{ title: string; href?: string }> = ({
  title,
  href,
}) => (
  <div className="mb-3 flex items-center gap-2.5 px-4 sm:px-6 lg:px-8">
    <span className="h-5 w-1 rounded-full bg-aurora" aria-hidden />
    <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
      {title}
    </h2>
    {href && (
      <Link href={href} passHref>
        <a className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-muted transition hover:text-accent">
          See all
          <ArrowRightIcon className="h-4 w-4" aria-hidden />
        </a>
      </Link>
    )}
  </div>
);

const Home = ({
  spotlight,
  trending,
  popular,
  topRated,
  thisSeason,
  recentlyAdded,
  airing,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  progressBar.finish();

  return (
    <>
      <NextSeo
        title="Home | kessoku moe"
        description="Trending, seasonal, and top-rated anime. Find something to watch on kessoku moe."
      />

      <Header />

      {spotlight.length > 0 && <Spotlight items={spotlight} />}

      <div className="pb-2">
        <Reveal>
          <ContinueWatchingRail />
        </Reveal>

        <Reveal>
          <RecommendationRails />
        </Reveal>

        <Reveal>
          <MyListRail />
        </Reveal>

        <Reveal>
          <WatchLaterRail />
        </Reveal>

        {trending.length > 0 && (
          <Reveal>
            <Section title="Trending now" animeList={asCards(trending)} />
          </Reveal>
        )}

        {thisSeason.length > 0 && (
          <Reveal>
            <Section title="This season" animeList={asCards(thisSeason)} />
          </Reveal>
        )}

        {airing.length > 0 && (
          <Reveal>
            <section className="mt-10">
              <RailHeading title="Airing this week" href="/schedule" />
              <div className="edge-fade-x">
                <div className="flex snap-x gap-4 overflow-x-auto overflow-y-hidden scroll-smooth px-4 pb-3 scrollbar-hide sm:px-6 lg:px-8">
                  {airing.map((entry) => (
                    <AiringCard
                      key={`${entry.media?.id}-${entry.episode}-${entry.airingAt}`}
                      entry={entry}
                    />
                  ))}
                </div>
              </div>
            </section>
          </Reveal>
        )}

        {recentlyAdded.length > 0 && (
          <Reveal>
            <Section title="Just dropped" animeList={asCards(recentlyAdded)} />
          </Reveal>
        )}

        {popular.length > 0 && (
          <Reveal>
            <Section title="Popular" animeList={asCards(popular)} />
          </Reveal>
        )}

        {topRated.length > 0 && (
          <Reveal>
            <Section title="All-time greats" animeList={asCards(topRated)} />
          </Reveal>
        )}

        {/* Browse by genre */}
        <Reveal>
          <section className="mx-auto mt-14 w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="h-5 w-1 rounded-full bg-aurora" aria-hidden />
              <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
                Browse by genre
              </h2>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {GENRES.map((genre) => (
                <Link key={genre} href={`/genre/${genre}`} passHref>
                  <a className="rounded-full border border-line/70 bg-surface/50 px-4 py-2 text-sm font-medium text-muted backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:border-accent/60 hover:bg-surface-2 hover:text-fg">
                    {genre}
                  </a>
                </Link>
              ))}
            </div>
          </section>
        </Reveal>
      </div>

      <Footer />
    </>
  );
};

export default Home;
