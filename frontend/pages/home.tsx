import { useMemo } from 'react';

import { InferGetServerSidePropsType } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { NextSeo } from 'next-seo';

import AiringCard from '@components/anime/AiringCard';
import ContinueWatchingRail from '@components/anime/ContinueWatchingRail';
import MyListRail from '@components/anime/MyListRail';
import RecommendationRails from '@components/anime/RecommendationRails';
import Spotlight from '@components/anime/Spotlight';
import WatchLaterRail from '@components/anime/WatchLaterRail';
import Footer from '@components/Footer';
import Header from '@components/Header';
import CompactAnimeRow from '@components/home/CompactAnimeRow';
import CoverflowCarousel, {
  CoverflowSlide,
} from '@components/home/CoverflowCarousel';
import { coverSrc } from '@components/home/HomePoster';
import SectionHeading from '@components/home/SectionHeading';
import progressBar from '@components/Progress';
import styles from '@styles/Home.module.css';
import { fetchHomeData } from '@utility/anilist';
import { base64SolidImage } from '@utility/image';
import { pickTitle, useTitle, useTitleLang } from '@utility/titleLang';

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

function animeSubtitle(anime: AnimeInfoFragment): string | undefined {
  const parts: string[] = [];
  if (anime.format) parts.push(anime.format);
  if (anime.duration) parts.push(`${anime.duration} min`);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function useAnimeSlides(anime: AnimeInfoFragment[]): CoverflowSlide[] {
  const lang = useTitleLang();
  return useMemo(
    () =>
      anime.map((item) => {
        const title = pickTitle(item.title, lang);
        return {
          src: coverSrc(item.coverImage),
          alt: title,
          title,
          subtitle: animeSubtitle(item),
          href: `/anime/${item.id}`,
        };
      }),
    [anime, lang]
  );
}

const TrendingRow: React.FC<{ anime: AnimeInfoFragment; rank: number }> = ({
  anime,
  rank,
}) => {
  const title = useTitle(anime.title);
  const src = coverSrc(anime.coverImage);

  return (
    <div className={styles.trendingRow}>
      <span className={styles.trendingRank}>{rank}</span>

      <div className={styles.trendingCover}>
        <div className="aspect-w-2 aspect-h-3 w-full">
          <div className={styles.trendingCoverArt}>
            {src && (
              <Image
                src={src}
                alt=""
                layout="fill"
                objectFit="cover"
                placeholder="blur"
                blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
                  anime.coverImage?.color || '#1a1626'
                )}`}
              />
            )}
          </div>
        </div>
      </div>

      <Link href={`/anime/${anime.id}`} passHref>
        <a className="min-w-0 truncate text-sm font-semibold text-fg transition hover:text-accent">
          {title}
        </a>
      </Link>
    </div>
  );
};

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

  const trendingList = asCards(trending).slice(0, 6);
  const seasonList = asCards(thisSeason);
  const droppedList = asCards(recentlyAdded).slice(0, 3);
  const seasonSlides = useAnimeSlides(seasonList);
  const droppedSlides = useAnimeSlides(droppedList);
  const popularList = asCards(popular).slice(0, 5);
  const topRatedList = asCards(topRated).slice(0, 5);
  const wideGenres = GENRES.slice(0, 2);
  const chipGenres = GENRES.slice(2);

  return (
    <>
      <NextSeo
        title="Home | kessoku moe"
        description="Trending, seasonal, and top-rated anime. Find something to watch on kessoku moe."
      />

      <Header />

      <main className={styles.main}>
        {spotlight.length > 0 && <Spotlight items={spotlight} />}
        <ContinueWatchingRail />
        <RecommendationRails />
        <MyListRail />
        <WatchLaterRail />
        {trendingList.length > 0 && (
          <section className={styles.section}>
            <SectionHeading
              title="Trending now"
              href="/browse?sort=TRENDING_DESC"
            />
            <div className={styles.trendingList}>
              {trendingList.map((anime, i) => (
                <TrendingRow key={anime.id} anime={anime} rank={i + 1} />
              ))}
            </div>
          </section>
        )}

        {seasonList.length > 0 && (
          <section className={styles.section}>
            <SectionHeading title="This season" href="/browse" />
            <CoverflowCarousel slides={seasonSlides} />
          </section>
        )}

        {airing.length > 0 && (
          <section className={styles.section}>
            <SectionHeading title="Airing this week" href="/schedule" />
            <div className={styles.airingGrid}>
              {airing.map((entry) => (
                <AiringCard
                  key={`${entry.media?.id}-${entry.episode}-${entry.airingAt}`}
                  entry={entry}
                />
              ))}
            </div>
          </section>
        )}

        {droppedList.length > 0 && (
          <section className={styles.section}>
            <SectionHeading title="Just dropped" href="/browse" />
            <CoverflowCarousel slides={droppedSlides} />
          </section>
        )}

        {(popularList.length > 0 || topRatedList.length > 0) && (
          <section className={styles.section}>
            <div className={styles.splitColumns}>
              {popularList.length > 0 && (
                <div>
                  <SectionHeading title="Popular" href="/browse" />
                  <div className={styles.compactList}>
                    {popularList.map((anime) => (
                      <CompactAnimeRow key={anime.id} anime={anime} />
                    ))}
                  </div>
                </div>
              )}
              {topRatedList.length > 0 && (
                <div>
                  <SectionHeading title="All-time greats" href="/browse" />
                  <div className={styles.compactList}>
                    {topRatedList.map((anime) => (
                      <CompactAnimeRow key={anime.id} anime={anime} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
        <section className={styles.section}>
          <SectionHeading title="Browse by genre" />
          <div className={styles.genreWideRow}>
            {wideGenres.map((genre) => (
              <Link key={genre} href={`/genre/${genre}`} passHref>
                <a className={styles.genreTile}>{genre}</a>
              </Link>
            ))}
          </div>
          <div className={styles.genreChips}>
            {chipGenres.map((genre) => (
              <Link key={genre} href={`/genre/${genre}`} passHref>
                <a className="inline-flex min-h-[44px] items-center rounded-[5px] border border-[#5a495f] px-3.5 py-2 text-[13px] text-[#c9bdc8] transition hover:text-fg">
                  {genre}
                </a>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
};

export default Home;
