import { useEffect, useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { ClockIcon, ThumbUpIcon } from '@heroicons/react/outline';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayIcon,
} from '@heroicons/react/solid';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import Genre from '@components/Genre';
import Icon from '@components/Icon';
import { EASE } from '@components/motion/Reveal';
import progressBar from '@components/Progress';
import { MediaBanner } from '@utility/anilist';
import { pickTitle, useTitleLang } from '@utility/titleLang';
import { stripHtml } from '@utility/utils';

export interface SpotlightProps {
  items: MediaBanner[];
}

const ROTATE_MS = 7000;

/**
 * Rotating hero. Crossfades through the top featured titles, auto-advancing
 * every few seconds. Pauses on hover/focus, exposes prev/next + dot controls,
 * and respects prefers-reduced-motion (no auto-rotate, manual nav still works).
 */
const Spotlight: React.FC<SpotlightProps> = ({ items }) => {
  const reduced = useReducedMotion();
  const lang = useTitleLang();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const count = items.length;

  // Finish the top progress bar even if the key art never fires onLoadingComplete.
  useEffect(() => {
    progressBar.finish();
  }, []);

  useEffect(() => {
    if (reduced || paused || count <= 1) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), ROTATE_MS);
    return () => clearInterval(id);
  }, [reduced, paused, count]);

  if (count === 0) return null;

  const active = items[Math.min(index, count - 1)];
  const title = pickTitle(active.title, lang);
  const subtitle =
    lang === 'english' ? active.title.romaji : active.title.english;
  const go = (dir: number) => setIndex((i) => (i + dir + count) % count);

  return (
    <section
      className="relative isolate w-full overflow-hidden"
      aria-roledescription="carousel"
      aria-label="Featured anime"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="relative h-[60vh] min-h-[460px] w-full sm:h-[66vh] lg:h-[76vh] lg:min-h-[600px]">
        {/* Crossfading key art (with a slow Ken Burns drift when motion is allowed). */}
        <AnimatePresence initial={false}>
          <motion.div
            key={active.id}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: EASE }}
          >
            {active.bannerImage ? (
              <motion.div
                className="absolute inset-0"
                initial={reduced ? false : { scale: 1.06 }}
                animate={reduced ? {} : { scale: 1 }}
                transition={{ duration: 8, ease: 'linear' }}
              >
                <Image
                  priority={index === 0}
                  src={active.bannerImage}
                  alt={`Key art for ${title}`}
                  layout="fill"
                  objectFit="cover"
                  objectPosition="center 25%"
                  onLoadingComplete={progressBar.finish}
                />
              </motion.div>
            ) : (
              <div className="absolute inset-0 bg-canvas-2" />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Scrims to canvas — legibility, not decoration. */}
        <div className="via-canvas/55 absolute inset-0 bg-gradient-to-t from-canvas to-canvas/10" />
        <div className="via-canvas/45 absolute inset-0 bg-gradient-to-r from-canvas/95 to-transparent" />

        <div className="absolute inset-0 z-10 flex flex-col justify-end px-4 pb-16 sm:px-6 lg:px-8 lg:pb-20">
          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              className="max-w-2xl"
              initial={reduced ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease: EASE }}
            >
              <p className="font-sans text-xs font-semibold uppercase tracking-[0.25em] text-accent">
                this week&apos;s spotlight
              </p>

              <h1 className="mt-2 font-display text-3xl font-extrabold leading-[1.04] text-fg sm:text-5xl lg:text-6xl">
                {title}
              </h1>

              {subtitle && subtitle !== title && (
                <p className="mt-1.5 text-sm text-muted line-clamp-1 sm:text-base">
                  {subtitle}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
                {active.format && <Icon icon={PlayIcon} text={active.format} />}
                {active.duration && (
                  <Icon icon={ClockIcon} text={`${active.duration} min`} />
                )}
                {active.meanScore && (
                  <Icon icon={ThumbUpIcon} text={`${active.meanScore}%`} />
                )}
              </div>

              {active.genres && active.genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {active.genres.slice(0, 4).map((genre) => (
                    <Genre key={genre} genre={genre} />
                  ))}
                </div>
              )}

              {active.description && (
                <p className="mt-4 hidden max-w-xl text-sm leading-relaxed text-muted md:line-clamp-3 lg:block">
                  {stripHtml(active.description)}
                </p>
              )}

              <Link href={`/anime/${active.id}`} passHref>
                <a className="mt-6 inline-flex items-center gap-2 rounded-full bg-aurora px-6 py-3 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 ease-out hover:brightness-110 active:scale-95">
                  <PlayIcon className="h-5 w-5" />
                  Watch now
                </a>
              </Link>
            </motion.div>
          </AnimatePresence>

          {/* Carousel controls */}
          {count > 1 && (
            <div className="mt-6 flex items-center gap-3 sm:absolute sm:bottom-8 sm:right-6 sm:mt-0 lg:right-8">
              <div
                className="flex items-center gap-1.5"
                role="tablist"
                aria-label="Choose featured slide"
              >
                {items.map((item, i) => {
                  const isActive = i === index;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      aria-label={`Slide ${i + 1} of ${count}`}
                      onClick={() => setIndex(i)}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        isActive
                          ? 'w-6 bg-accent'
                          : 'w-1.5 bg-fg/30 hover:bg-fg/60'
                      }`}
                    />
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label="Previous featured title"
                  onClick={() => go(-1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-line/60 bg-canvas/50 text-fg backdrop-blur-sm transition duration-200 hover:border-accent/60 hover:bg-surface-2 active:scale-95"
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Next featured title"
                  onClick={() => go(1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-line/60 bg-canvas/50 text-fg backdrop-blur-sm transition duration-200 hover:border-accent/60 hover:bg-surface-2 active:scale-95"
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default Spotlight;
