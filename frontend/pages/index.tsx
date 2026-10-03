import { useEffect, useState } from 'react';

import { InferGetServerSidePropsType } from 'next';
import Image from 'next/image';
import { useRouter } from 'next/router';

import {
  BadgeCheckIcon,
  BookmarkIcon,
  ChatAlt2Icon,
  CheckCircleIcon,
} from '@heroicons/react/outline';
import { motion } from 'framer-motion';
import { NextSeo } from 'next-seo';

import Setlist from '@components/landing/Setlist';
import { EASE } from '@components/motion/Reveal';
import progressBar from '@components/Progress';
import useReducedMotion from '@hooks/useReducedMotion';
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

const COMPANION_DEMO: { id: string; reply: string }[] = [
  {
    id: 'hyped',
    reply:
      "OHHH the white-haired one?? That's Frieren, an absolute powerhouse and instantly iconic. you are so gonna love her, that is ALL I'm saying.",
  },
  {
    id: 'thoughtful',
    reply:
      "That's Frieren. The show frames her as someone time moves differently for, so watch how she holds people at arm's length. You have only just met her, so I'll leave it there.",
  },
  {
    id: 'soft',
    reply:
      "That's Frieren. She carries this quiet, faraway sadness, like she is always half a step outside the moment. You'll feel it more as the story goes.",
  },
  {
    id: 'off the rails',
    reply:
      "the silver-haired menace? that's Frieren. struts around like she pays rent in everyone's head and owes nothing. iconic behavior. I'll zip it before I spoil anything.",
  },
];

const CompanionMock: React.FC = () => {
  const reduced = useReducedMotion();
  const [tone, setTone] = useState('thoughtful');
  const active = COMPANION_DEMO.find((t) => t.id === tone) ?? COMPANION_DEMO[1];

  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-line/50 bg-canvas-2/70 p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-aurora text-accent-ink">
          <ChatAlt2Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-fg">your seat-mate</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
          spoiler-safe
        </span>
      </div>
      <div className="space-y-2">
        <p className="ml-auto w-fit max-w-[82%] rounded-2xl rounded-br-sm bg-surface-2 px-3 py-2 text-sm text-fg">
          wait, who was the white-haired elf again?
        </p>
        <motion.p
          key={tone}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: EASE }}
          className="w-fit max-w-[90%] rounded-2xl rounded-bl-sm bg-surface px-3 py-2 text-sm text-muted"
        >
          {active.reply}
        </motion.p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {COMPANION_DEMO.map(({ id }) => {
          const on = id === tone;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTone(id)}
              aria-pressed={on}
              className={
                on
                  ? 'rounded-full bg-aurora px-2.5 py-1 text-[11px] font-semibold text-accent-ink transition'
                  : 'rounded-full border border-line/60 bg-surface/60 px-2.5 py-1 text-[11px] text-muted transition hover:border-accent/50 hover:text-fg'
              }
            >
              {id}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-faint">tap a mood</span>
      </div>
    </div>
  );
};

// An AniList list entry, synced: status + auto-counted progress. `cover` is a
// real poster (Frieren) from getServerSideProps, so the card is never blank.
const SyncMock: React.FC<{ cover: string }> = ({ cover }) => (
  <div className="mx-auto max-w-sm rounded-2xl border border-line/50 bg-canvas-2/70 p-5 shadow-card">
    <div className="mb-4 flex items-center gap-2">
      <BadgeCheckIcon className="h-4 w-4 text-accent" aria-hidden />
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-faint">
        synced to AniList
      </span>
    </div>
    <div className="flex items-center gap-3">
      <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-2">
        {cover ? (
          <Image alt="" src={cover} layout="fill" objectFit="cover" />
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-fg">
          Frieren: Beyond Journey&apos;s End
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-full bg-aurora px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
            Watching
          </span>
          <span className="text-xs tabular-nums text-muted">
            episode 7 / 28
          </span>
        </div>
      </div>
    </div>
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface">
      <div className="h-full w-1/4 rounded-full bg-aurora" />
    </div>
    <div className="mt-4 flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        <CheckCircleIcon className="h-4 w-4 text-accent" aria-hidden />
        counts itself as you watch
      </span>
      <span className="inline-flex items-center gap-1 rounded-full border border-line/60 bg-surface/60 px-2.5 py-1 text-[11px] text-muted">
        <BookmarkIcon className="h-3.5 w-3.5" aria-hidden />
        Watch Later
      </span>
    </div>
  </div>
);

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
        companion={<CompanionMock />}
        sync={<SyncMock cover={demoCover} />}
      />
    </>
  );
};

export default Splash;
