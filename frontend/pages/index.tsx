import { useEffect, useState } from 'react';

import { InferGetServerSidePropsType } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  BookmarkIcon,
  BookOpenIcon,
  CalendarIcon,
  ChartBarIcon,
  ChatAlt2Icon,
  CheckCircleIcon,
  DeviceMobileIcon,
  FastForwardIcon,
  SwitchHorizontalIcon,
  TranslateIcon,
  UserGroupIcon,
} from '@heroicons/react/outline';
import { PlayIcon } from '@heroicons/react/solid';
import { motion, useReducedMotion } from 'framer-motion';
import { NextSeo } from 'next-seo';

import AiringCard from '@components/anime/AiringCard';
import Section from '@components/anime/Section';
import Footer from '@components/Footer';
import Reveal, {
  EASE,
  RevealItem,
  RevealStagger,
} from '@components/motion/Reveal';
import progressBar from '@components/Progress';
import useMediaQuery from '@hooks/useMediaQuery';
import { AiringEntry, fetchSplashData, MediaInfo } from '@utility/anilist';
import { base64SolidImage } from '@utility/image';

export const getServerSideProps = async () => {
  const data = await fetchSplashData();
  return { props: { ...data } };
};

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

const Poster: React.FC<{ src: string }> = ({ src }) => (
  // eslint-disable-next-line @next/next/no-img-element -- decorative marquee art; next/image adds no value at this opacity
  <img
    src={src}
    alt=""
    aria-hidden
    loading="lazy"
    decoding="async"
    className="h-36 w-24 shrink-0 rounded-xl object-cover sm:h-44 sm:w-28"
  />
);

const PosterMarquee: React.FC<{
  covers: string[];
  reverse?: boolean;
  // Frozen (no scroll) on phones / reduced-motion: a full-width row of 16
  // posters sliding forever is a big layer to composite every frame on a weak
  // mobile GPU. Static, at 0.13 opacity behind the scrims, it reads the same.
  frozen: boolean;
}> = ({ covers, reverse, frozen }) => {
  if (covers.length === 0) return null;
  const row = [...covers, ...covers];

  return (
    <motion.div
      className="flex w-max gap-3"
      animate={
        frozen ? undefined : { x: reverse ? ['-50%', '0%'] : ['0%', '-50%'] }
      }
      transition={
        frozen ? undefined : { duration: 70, ease: 'linear', repeat: Infinity }
      }
    >
      {row.map((src, i) => (
        <Poster key={`${src}-${i}`} src={src} />
      ))}
    </motion.div>
  );
};

const Chip: React.FC<{
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}> = ({ icon: Glyph, children }) => (
  <RevealItem>
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-surface/50 px-3.5 py-1.5 text-sm text-muted backdrop-blur-sm">
      <Glyph className="h-4 w-4 text-accent" aria-hidden />
      {children}
    </span>
  </RevealItem>
);

const FeatureEyebrow: React.FC<{
  icon: React.FC<React.SVGProps<SVGSVGElement>>;
  children: React.ReactNode;
}> = ({ icon: Glyph, children }) => (
  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
    <Glyph className="h-4 w-4" aria-hidden />
    {children}
  </span>
);

const PosterFan: React.FC<{ items: MediaInfo[] }> = ({ items }) => {
  const picks = items.slice(0, 3);
  if (picks.length === 0) return null;

  const layout = [
    { x: '-58%', rotate: -9, z: 10 },
    { x: '0%', rotate: 0, z: 20 },
    { x: '58%', rotate: 9, z: 10 },
  ];

  return (
    <div className="relative mx-auto flex h-64 w-full max-w-md items-center justify-center sm:h-72">
      {picks.map((m, i) => {
        const pos = layout[i];
        const title = m.title.romaji || m.title.english || 'Cover';
        return (
          <Link key={m.id} href={`/anime/${m.id}`} passHref>
            <a
              className="group absolute transition-transform duration-300 ease-out hover:-translate-y-2"
              style={{
                transform: `translateX(${pos.x}) rotate(${pos.rotate}deg)`,
                zIndex: pos.z,
              }}
            >
              <div className="relative h-52 w-36 overflow-hidden rounded-2xl shadow-lift ring-1 ring-line/40 transition duration-300 group-hover:ring-2 group-hover:ring-accent/60 sm:h-60 sm:w-40">
                <Image
                  alt={`Cover for ${title}`}
                  src={m.coverImage.large || m.coverImage.medium || ''}
                  layout="fill"
                  objectFit="cover"
                  placeholder="blur"
                  blurDataURL={`data:image/svg+xml;base64,${base64SolidImage(
                    m.coverImage.color || '#1a1a2e'
                  )}`}
                />
              </div>
            </a>
          </Link>
        );
      })}
    </div>
  );
};

// A spoiler-safe chat exchange with the watch companion. The tone chips are
// live: tap one and the same question gets answered in that persona. Labels
// match the real companion's tones (utility/companionPrefs.ts).
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

// The custom player control bar: skip intro, captions, speed.
const PlayerMock: React.FC = () => (
  <div className="mx-auto max-w-md rounded-2xl border border-line/50 bg-canvas-2/70 p-4 shadow-card">
    <div className="relative h-1.5 w-full rounded-full bg-surface">
      <div className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-aurora" />
      <span
        className="absolute -top-1 left-[40%] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-accent shadow-glow"
        aria-hidden
      />
    </div>
    <div className="mt-3 flex items-center gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-aurora text-accent-ink shadow-glow">
        <PlayIcon className="ml-0.5 h-4 w-4" aria-hidden />
      </span>
      <span className="text-xs tabular-nums text-muted">12:04 / 23:40</span>
      <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-surface/60 px-3 py-1 text-xs font-semibold text-accent">
        <FastForwardIcon className="h-4 w-4" aria-hidden />
        Skip Intro
      </span>
      <TranslateIcon className="h-5 w-5 text-muted" aria-hidden />
      <span className="text-xs font-semibold text-muted">1x</span>
    </div>
    <p className="mt-3 text-[11px] text-faint">
      skip intro · auto-next · captions you can drag · up to 1080p
    </p>
  </div>
);

// The episode list with canon / filler / mixed tags, mirroring the watch page.
const FILLER_KINDS = [
  'canon',
  'canon',
  'canon',
  'filler',
  'canon',
  'mixed',
  'canon',
  'canon',
  'filler',
  'filler',
  'canon',
  'mixed',
];
const FILLER_BARS: Record<string, string> = {
  canon: 'bg-emerald-400/80',
  filler: 'bg-amber-400/80',
  mixed: 'bg-gradient-to-r from-emerald-400/80 to-amber-400/80',
};
const fillerBar = (kind: string): string =>
  FILLER_BARS[kind] ?? FILLER_BARS.canon;
const FillerMock: React.FC = () => (
  <div className="mx-auto max-w-md rounded-2xl border border-line/50 bg-canvas-2/70 p-5 shadow-card">
    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-faint">
      episodes
    </p>
    <div className="grid grid-cols-6 gap-2">
      {FILLER_KINDS.map((kind, i) => (
        <div
          key={`ep-${i + 1}`}
          className="rounded-lg border border-line/40 bg-surface/60 px-1 pb-1 pt-1.5 text-center"
        >
          <span className="block text-xs font-semibold text-fg">{i + 1}</span>
          <span
            className={`mt-1 block h-1 rounded-full ${fillerBar(kind)}`}
            aria-hidden
          />
        </div>
      ))}
    </div>
    <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-emerald-400/80" aria-hidden />
        canon
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-400/80" aria-hidden />
        filler
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="h-2 w-2 rounded-full bg-gradient-to-r from-emerald-400/80 to-amber-400/80"
          aria-hidden
        />
        mixed
      </span>
    </div>
  </div>
);

// The manga reader, in miniature: a language switch, the spot it saved you, and
// the two ways to read. Tapping a mode flips the frame between a webtoon's long
// scroll and side-by-side pages, the same choice the real reader gives you.
const READER_MODES = ['Webtoon', 'Paged'] as const;
const MangaMock: React.FC = () => {
  const reduced = useReducedMotion();
  const [mode, setMode] = useState<typeof READER_MODES[number]>('Webtoon');

  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-line/50 bg-canvas-2/70 p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-aurora text-accent-ink">
          <BookOpenIcon className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-sm font-semibold text-fg">now reading</span>
        <span className="ml-auto flex items-center gap-1">
          <span className="rounded-full bg-aurora px-2 py-0.5 text-[11px] font-semibold text-accent-ink">
            EN
          </span>
          <span className="rounded-full border border-line/60 bg-surface/60 px-2 py-0.5 text-[11px] font-semibold text-muted">
            ID
          </span>
        </span>
      </div>

      <div className="relative h-44 overflow-hidden rounded-xl border border-line/40 bg-surface/40 p-3">
        <span className="absolute left-3 top-3 z-10 rounded-full bg-canvas/70 px-2 py-0.5 text-[10px] font-semibold text-fg backdrop-blur-sm">
          Ch. 12
        </span>
        <motion.div
          key={mode}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE }}
          className="h-full pt-5"
        >
          {mode === 'Webtoon' ? (
            <div className="space-y-2">
              {[
                'h-10 from-accent/30',
                'h-14 from-accent-soft/25',
                'h-9 from-accent/20',
              ].map((c) => (
                <div
                  key={c}
                  className={`rounded-md bg-gradient-to-br to-surface-2 ${c}`}
                  aria-hidden
                />
              ))}
            </div>
          ) : (
            <div className="flex h-full justify-center gap-2">
              <div
                className="h-full w-1/3 rounded-md bg-gradient-to-br from-accent/30 to-surface-2"
                aria-hidden
              />
              <div
                className="h-full w-1/3 rounded-md bg-gradient-to-br from-accent-soft/25 to-surface-2"
                aria-hidden
              />
            </div>
          )}
        </motion.div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div className="h-full w-2/3 rounded-full bg-aurora" />
      </div>

      <div className="mt-3 flex items-center gap-2">
        {READER_MODES.map((m) => {
          const on = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={on}
              className={
                on
                  ? 'inline-flex min-h-[44px] items-center rounded-full bg-aurora px-3.5 text-[11px] font-semibold text-accent-ink transition [touch-action:manipulation] active:scale-95'
                  : 'inline-flex min-h-[44px] items-center rounded-full border border-line/60 bg-surface/60 px-3.5 text-[11px] text-muted transition [touch-action:manipulation] hover:border-accent/50 hover:text-fg active:scale-95'
              }
            >
              {m}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-muted">
          picks up on page 14
        </span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Splash top nav (own minimal bar; the app Header lives on /home)
// ---------------------------------------------------------------------------

const SplashNav: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-colors duration-300 ${
        scrolled
          ? 'border-b border-line/50 bg-canvas/80 backdrop-blur-md sm:backdrop-blur-xl'
          : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-screen-2xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" passHref>
          <a
            className="flex items-center gap-2 transition active:scale-95"
            aria-label="kessoku moe"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- static SVG logo */}
            <img
              src="/kessoku-moe-icon.svg"
              alt="kessoku moe"
              className="h-8 w-8"
            />
            <span className="font-display text-lg font-bold lowercase tracking-tight text-fg">
              kessoku<span className="text-accent"> moe</span>
            </span>
          </a>
        </Link>

        <nav className="ml-2 hidden items-center gap-5 sm:flex">
          <Link href="/browse" passHref>
            <a className="text-sm font-medium text-muted transition hover:text-fg">
              Browse
            </a>
          </Link>
          <Link href="/manga" passHref>
            <a className="-my-2 inline-flex min-h-[44px] items-center gap-1.5 py-2 text-sm font-medium text-muted transition hover:text-fg">
              Manga
              <span className="rounded-full bg-aurora px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-accent-ink">
                new
              </span>
            </a>
          </Link>
          <Link href="/schedule" passHref>
            <a className="text-sm font-medium text-muted transition hover:text-fg">
              Schedule
            </a>
          </Link>
        </nav>

        <Link href="/home" passHref>
          <a className="ml-auto inline-flex items-center gap-2 rounded-full bg-aurora px-4 py-2 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 hover:brightness-110 active:scale-95">
            <PlayIcon className="h-4 w-4" />
            Start watching
          </a>
        </Link>
      </div>
    </header>
  );
};

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

const heroContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const heroItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const Hero: React.FC<{ covers: string[] }> = ({ covers }) => {
  const reduced = useReducedMotion();
  // Touch devices (phones) have weaker GPUs; animating large blurred surfaces
  // there stutters. We keep the glows static on touch (the look survives) and
  // only drift them on desktop. Continuous-motion gate, separate from the
  // one-time entrance reveals which stay everywhere.
  const coarse = useMediaQuery('(pointer: coarse)');
  const lite = Boolean(reduced) || coarse;
  const rowA = covers.slice(0, 8);
  const rowB = covers.slice(8, 16);

  return (
    <section className="relative isolate flex min-h-[88vh] w-full items-center overflow-hidden">
      {/* Atmosphere: faint poster wall + drifting stage-light glows + scrims. */}
      <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
        {/* No blur filter here: a blur over the moving marquee re-rasterizes every
          frame. At 0.13 opacity behind the scrims it reads the same without it. */}
        <div className="absolute inset-0 flex flex-col justify-center gap-3 opacity-[0.13]">
          <PosterMarquee covers={rowA} frozen={lite} />
          <PosterMarquee covers={rowB} reverse frozen={lite} />
        </div>

        {/* Stage-light glows. Translate-only drift (no scale) so the blurred
          surface is rasterized once and just composited, never re-blurred. */}
        <motion.div
          className="absolute -right-24 -top-28 h-[30rem] w-[30rem] rounded-full bg-accent/25 blur-3xl"
          animate={lite ? undefined : { x: [0, 40, 0], y: [0, 30, 0] }}
          transition={
            lite
              ? undefined
              : { duration: 20, repeat: Infinity, ease: 'easeInOut' }
          }
        />
        <motion.div
          className="absolute -left-28 top-1/3 h-[26rem] w-[26rem] rounded-full bg-accent-soft/20 blur-3xl"
          animate={lite ? undefined : { x: [0, -30, 0], y: [0, 40, 0] }}
          transition={
            lite
              ? undefined
              : { duration: 24, repeat: Infinity, ease: 'easeInOut' }
          }
        />

        <div className="via-canvas/85 absolute inset-0 bg-gradient-to-r from-canvas to-canvas/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-transparent to-canvas/60" />
      </div>

      <motion.div
        className="mx-auto w-full max-w-screen-2xl px-4 py-20 sm:px-6 lg:px-8"
        variants={heroContainer}
        initial={reduced ? 'show' : 'hidden'}
        animate="show"
      >
        <div className="max-w-3xl">
          <motion.div variants={heroItem}>
            <motion.img
              src="/kessoku-moe-icon.svg"
              alt=""
              aria-hidden
              className="h-14 w-14 sm:h-16 sm:w-16"
              animate={lite ? undefined : { y: [0, -8, 0], rotate: [0, -3, 0] }}
              transition={
                lite
                  ? undefined
                  : { duration: 5, repeat: Infinity, ease: 'easeInOut' }
              }
            />
          </motion.div>

          <motion.p
            variants={heroItem}
            className="mt-6 text-xs font-semibold uppercase tracking-[0.32em] text-accent"
          >
            dark · cute · a little rock
          </motion.p>

          <motion.h1
            variants={heroItem}
            className="mt-4 font-display text-4xl font-extrabold leading-[1.02] text-fg sm:text-6xl lg:text-7xl"
          >
            anime and manga,
            <br />
            one stage.
          </motion.h1>

          <motion.p
            variants={heroItem}
            className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
          >
            Thousands of titles to stream, plus manga and manhwa to read. No
            pop-ups, no sign-up. Skip the intro, save your page, and bring a
            seat-mate who never spoils the ending.
          </motion.p>

          <motion.div
            variants={heroItem}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Link href="/home" passHref>
              <a className="inline-flex items-center gap-2 rounded-full bg-aurora px-7 py-3.5 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 ease-out hover:brightness-110 active:scale-95 sm:text-base">
                <PlayIcon className="h-5 w-5" />
                Start watching
              </a>
            </Link>
            <Link href="/browse" passHref>
              <a className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-surface/40 px-7 py-3.5 text-sm font-semibold text-fg backdrop-blur-sm transition duration-200 ease-out hover:border-accent/60 hover:bg-surface-2 active:scale-95 sm:text-base">
                Browse the catalog
                <ArrowRightIcon className="h-4 w-4" />
              </a>
            </Link>
          </motion.div>

          <motion.p variants={heroItem} className="mt-5 text-sm text-faint">
            Catalog, art, and schedules all come from AniList.
          </motion.p>
        </div>
      </motion.div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const Splash = ({
  trending,
  airing,
  featured,
  demoCover,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const router = useRouter();

  useEffect(() => {
    progressBar.finish();
    // Warm the content home so "Start watching" feels instant.
    router.prefetch('/home');
  }, [router]);

  const covers = trending
    .map((m) => m.coverImage.medium || m.coverImage.large)
    .filter((c): c is string => Boolean(c));

  return (
    <>
      <NextSeo
        title="kessoku moe · anime and manga, one stage"
        description="Free anime streaming and a manga, manhwa, and manhua reader in one place. Trending and top-rated picks, an airing schedule with live countdowns, page-by-page or webtoon reading. Dark, cute, a little rock."
      />

      <SplashNav />

      <main>
        <Hero covers={covers} />

        {/* Credential strip */}
        <RevealStagger className="mx-auto -mt-4 flex max-w-screen-2xl flex-wrap gap-2.5 px-4 sm:px-6 lg:px-8">
          <RevealItem>
            <Link href="/manga" passHref>
              <a className="bg-aurora/15 hover:bg-aurora/25 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-accent/60 px-3.5 py-1.5 text-sm font-semibold text-fg backdrop-blur-sm transition [touch-action:manipulation] active:scale-95">
                <BookOpenIcon className="h-4 w-4 text-accent" aria-hidden />
                manga &amp; manhwa
                <span className="rounded-full bg-aurora px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-accent-ink">
                  new
                </span>
              </a>
            </Link>
          </RevealItem>
          <Chip icon={BadgeCheckIcon}>AniList sync</Chip>
          <Chip icon={ChatAlt2Icon}>watch companion</Chip>
          <Chip icon={ChartBarIcon}>filler vs canon</Chip>
          <Chip icon={FastForwardIcon}>skip intro + auto-next</Chip>
          <Chip icon={DeviceMobileIcon}>installable</Chip>
        </RevealStagger>

        {/* Features */}
        <section className="mx-auto mt-24 max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <Reveal className="mb-14 max-w-2xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-fg sm:text-4xl">
              More than a play button
            </h2>
            <p className="mt-3 text-muted">
              Skipping the pop-ups and dead links is the low bar. kessoku moe
              clears it, then keeps going: a companion in the next seat, your
              list synced, filler flagged before you click, a player tuned to
              stay out of your way.
            </p>
          </Reveal>

          <div className="space-y-20 lg:space-y-28">
            {/* Companion */}
            <Reveal>
              <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
                <div className="lg:w-1/2">
                  <FeatureEyebrow icon={ChatAlt2Icon}>companion</FeatureEyebrow>
                  <h3 className="mt-3 font-display text-2xl font-bold text-fg sm:text-3xl">
                    Someone to watch it with
                  </h3>
                  <p className="mt-4 max-w-md leading-relaxed text-muted">
                    A seat-mate who talks about the episode while it plays. Ask
                    who that side character was, or what the ending meant. It
                    only knows as far as you&apos;ve watched, so it never spoils
                    what&apos;s next. Pick its mood: hyped, thoughtful, soft, or
                    completely off the rails.
                  </p>
                </div>
                <div className="lg:w-1/2">
                  <CompanionMock />
                </div>
              </div>
            </Reveal>

            {/* AniList sync */}
            <Reveal>
              <div className="flex flex-col gap-10 lg:flex-row-reverse lg:items-center lg:gap-16">
                <div className="lg:w-1/2">
                  <FeatureEyebrow icon={BadgeCheckIcon}>
                    your list
                  </FeatureEyebrow>
                  <h3 className="mt-3 font-display text-2xl font-bold text-fg sm:text-3xl">
                    Sign in once, your list follows you
                  </h3>
                  <p className="mt-4 max-w-md leading-relaxed text-muted">
                    Connect AniList and it all lines up: what you&apos;re
                    watching, what you finished, what&apos;s still on the pile.
                    Episodes count themselves as you go, and your status lands
                    back on your AniList profile. Not ready for a title yet?
                    Drop it in Watch Later, right on the home page.
                  </p>
                </div>
                <div className="lg:w-1/2">
                  <SyncMock cover={demoCover} />
                </div>
              </div>
            </Reveal>

            {/* Player */}
            <Reveal>
              <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
                <div className="lg:w-1/2">
                  <FeatureEyebrow icon={FastForwardIcon}>player</FeatureEyebrow>
                  <h3 className="mt-3 font-display text-2xl font-bold text-fg sm:text-3xl">
                    A player that gets out of your way
                  </h3>
                  <p className="mt-4 max-w-md leading-relaxed text-muted">
                    Skip the intro with one tap. Auto-play rolls you into the
                    next episode. Captions come in a few languages, drag them
                    where you like, nudge the timing when they drift. Set your
                    speed and quality, then let the keyboard do the rest.
                  </p>
                </div>
                <div className="lg:w-1/2">
                  <PlayerMock />
                </div>
              </div>
            </Reveal>

            {/* Filler vs canon */}
            <Reveal>
              <div className="flex flex-col gap-10 lg:flex-row-reverse lg:items-center lg:gap-16">
                <div className="lg:w-1/2">
                  <FeatureEyebrow icon={ChartBarIcon}>
                    no filler surprises
                  </FeatureEyebrow>
                  <h3 className="mt-3 font-display text-2xl font-bold text-fg sm:text-3xl">
                    Know what&apos;s canon before you commit
                  </h3>
                  <p className="mt-4 max-w-md leading-relaxed text-muted">
                    Every episode is tagged canon, filler, or a mix, right on
                    the episode list. Skip the padding on a long-runner, or
                    watch all of it on purpose. Either way you go in with your
                    eyes open.
                  </p>
                </div>
                <div className="lg:w-1/2">
                  <FillerMock />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Manga announcement — the new reader, framed as its own act */}
        <Reveal className="mt-24">
          <section className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl border border-accent/30 bg-canvas-2/50 px-6 py-12 sm:px-10 sm:py-14">
              <div aria-hidden className="absolute inset-0 -z-10">
                <div className="bg-accent/15 absolute -right-16 -top-20 h-72 w-72 rounded-full blur-3xl" />
              </div>
              <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-16">
                <div className="lg:w-1/2">
                  <FeatureEyebrow icon={BookOpenIcon}>
                    new · manga &amp; manhwa
                  </FeatureEyebrow>
                  <h2 className="mt-3 font-display text-2xl font-bold text-fg sm:text-3xl">
                    Read between episodes
                  </h2>
                  <p className="mt-4 max-w-md leading-relaxed text-muted">
                    Manga, manhwa, and manhua, tagged by where they&apos;re from
                    so you know what you&apos;re opening before the first page.
                    Read it page by page, or let a webtoon run in one long
                    scroll. It saves your spot to the exact page, your saves sit
                    under My List next to your shows, and an 18+ switch stays
                    off until you flip it. English and Indonesian, wherever the
                    scanlators have them.
                  </p>
                  <Link href="/manga" passHref>
                    <a className="mt-6 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-aurora px-7 py-3.5 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 ease-out hover:brightness-110 active:scale-95">
                      <BookOpenIcon className="h-5 w-5" />
                      Open the reader
                    </a>
                  </Link>
                </div>
                <div className="lg:w-1/2">
                  <MangaMock />
                </div>
              </div>
            </div>
          </section>
        </Reveal>

        {/* The rest */}
        <section className="mx-auto mt-24 max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="flex flex-col gap-12 lg:flex-row lg:items-center lg:gap-16">
              <div className="lg:w-1/2">
                <h2 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
                  The rest of the setlist
                </h2>
                <ul className="mt-6 space-y-5">
                  {[
                    {
                      icon: CalendarIcon,
                      title: 'Airing schedule',
                      body: 'See exactly when the next episode lands, down to the minute.',
                    },
                    {
                      icon: SwitchHorizontalIcon,
                      title: 'One-click server switch',
                      body: 'If a source stalls, jump to another without losing your place.',
                    },
                    {
                      icon: UserGroupIcon,
                      title: 'Voice actors and studios',
                      body: 'Follow a voice actor or a studio and pull up everything they touched.',
                    },
                    {
                      icon: DeviceMobileIcon,
                      title: 'Install on your phone',
                      body: 'Add it to your home screen. It runs like an app, no store.',
                    },
                  ].map(({ icon: Glyph, title, body }) => (
                    <li key={title} className="flex gap-4">
                      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/50 bg-surface/60 text-accent">
                        <Glyph className="h-5 w-5" aria-hidden />
                      </span>
                      <div>
                        <p className="font-semibold text-fg">{title}</p>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted">
                          {body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="lg:w-1/2">
                <PosterFan items={featured.length > 0 ? featured : trending} />
              </div>
            </div>
          </Reveal>
        </section>

        {/* Live proof */}
        {trending.length > 0 && (
          <Reveal className="mt-24">
            <Section
              title="Trending this week"
              animeList={trending as unknown as AnimeInfoFragment[]}
            />
          </Reveal>
        )}

        {/* Airing teaser */}
        {airing.length > 0 && (
          <Reveal className="mt-12">
            <div className="mb-3 flex items-center gap-2.5 px-4 sm:px-6 lg:px-8">
              <span className="h-5 w-1 rounded-full bg-aurora" aria-hidden />
              <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
                Airing this week
              </h2>
              <Link href="/schedule" passHref>
                <a className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-muted transition hover:text-accent">
                  See all
                  <ArrowRightIcon className="h-4 w-4" aria-hidden />
                </a>
              </Link>
            </div>
            <div className="edge-fade-x">
              <div className="flex snap-x gap-4 overflow-x-auto overflow-y-hidden scroll-smooth px-4 pb-3 scrollbar-hide sm:px-6 lg:px-8">
                {airing.slice(0, 12).map((entry: AiringEntry) => (
                  <AiringCard
                    key={`${entry.media?.id}-${entry.episode}-${entry.airingAt}`}
                    entry={entry}
                  />
                ))}
              </div>
            </div>
          </Reveal>
        )}

        {/* Final CTA */}
        <Reveal>
          <section className="mx-auto my-24 max-w-5xl px-4 sm:px-6 lg:px-8">
            <div className="relative overflow-hidden rounded-3xl border border-line/40 bg-canvas-2/60 px-6 py-16 text-center sm:py-20">
              <div aria-hidden className="absolute inset-0 -z-10">
                <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/25 blur-3xl" />
              </div>
              <h2 className="font-display text-3xl font-extrabold tracking-tight text-fg sm:text-5xl">
                Ready for the show?
              </h2>
              <p className="mx-auto mt-4 max-w-md text-muted">
                Thousands of shows and a shelf of manga, zero hoops. Sync your
                list, skip the intro, save your page, and bring someone to talk
                to. The stage is set.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link href="/home" passHref>
                  <a className="inline-flex items-center gap-2 rounded-full bg-aurora px-7 py-3.5 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 hover:brightness-110 active:scale-95 sm:text-base">
                    <PlayIcon className="h-5 w-5" />
                    Start watching
                  </a>
                </Link>
                <Link href="/browse" passHref>
                  <a className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-surface/40 px-7 py-3.5 text-sm font-semibold text-fg backdrop-blur-sm transition duration-200 hover:border-accent/60 hover:bg-surface-2 active:scale-95 sm:text-base">
                    Browse the catalog
                  </a>
                </Link>
              </div>
              <p className="mt-6 inline-flex items-center gap-2 text-xs text-faint">
                <DeviceMobileIcon className="h-4 w-4" aria-hidden />
                install it on your phone (PWA)
              </p>
            </div>
          </section>
        </Reveal>
      </main>

      <Footer />
    </>
  );
};

export default Splash;
