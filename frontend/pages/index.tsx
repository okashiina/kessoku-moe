import { useEffect } from 'react';

import { InferGetServerSidePropsType } from 'next';
import { useRouter } from 'next/router';

import { NextSeo } from 'next-seo';

import { CompanionDemo, SyncDemo } from '@components/landing/LandingDemos';
import Setlist from '@components/landing/Setlist';
import progressBar from '@components/Progress';
import { EMPTY_SPLASH, fetchSplashData } from '@utility/anilist';
import { getCartoonCatalogPage } from '@utility/cartoon';
import { cached } from '@utility/ssrCache';

export const getServerSideProps = async () => {
  // Cache the splash so the landing doesn't re-hit AniList on every visit. AniList
  // runs a degraded ~30 req/min limit and these SSR calls come from Railway's shared
  // datacenter IP, so an uncached landing stalled for ~18s during a rate-limit window.
  // Only a real (non-empty) splash is cached; a rate-limited miss returns empty rails
  // and retries next visit (fetchSplashData itself never throws).
  const [data, cartoons] = await Promise.all([
    cached('home:splash', 10 * 60_000, async () => {
      const d = await fetchSplashData();
      if (!d.trending.length) throw new Error('splash empty (rate-limited)');
      return d;
    }).catch(() => EMPTY_SPLASH),
    getCartoonCatalogPage(0)
      .then(({ shows }) =>
        [...shows]
          .sort((a, b) => (b.weight || 0) - (a.weight || 0))
          .slice(0, 12)
          .map((show) => ({
            id: show.id,
            name: show.name,
            cover: show.image?.medium || null,
            year: show.premiered?.slice(0, 4) || null,
          }))
      )
      .catch(() => []),
  ]);
  return { props: { ...data, cartoons } };
};

const Splash = ({
  trending,
  featured,
  demoCover,
  cartoons,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();
  useEffect(() => {
    progressBar.finish();
    router.prefetch('/home');
  }, [router]);
  return (
    <>
      <NextSeo
        title="kessoku moe · anime, manga, and cartoons, one stage"
        description="Watch anime and cartoons, read manga, and keep your place. AniList sync, a watch companion, and your next favorite story on kessoku moe."
      />
      <Setlist
        trending={trending}
        featured={featured}
        cartoons={cartoons}
        companion={<CompanionDemo />}
        sync={<SyncDemo cover={demoCover} />}
      />
    </>
  );
};

export default Splash;
