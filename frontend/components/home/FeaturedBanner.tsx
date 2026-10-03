import { useEffect, useState } from 'react';

import Link from 'next/link';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
} from '@heroicons/react/outline';

import styles from '@styles/FeaturedBanner.module.css';

export interface FeaturedBannerItem {
  id: number;
  title: string;
  cover?: string;
  backdrop?: string;
  summary: string;
  meta: string;
  href: string;
}

const FeaturedBanner: React.FC<{
  items: FeaturedBannerItem[];
  label: string;
  ctaLabel: string;
}> = ({ items, label, ctaLabel }) => {
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(media.matches);
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateMotion();
    updateVisibility();
    media.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      media.removeEventListener('change', updateMotion);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (
      items.length < 2 ||
      paused ||
      reducedMotion ||
      !autoRotate ||
      !pageVisible
    )
      return undefined;
    const timer = window.setTimeout(
      () => setSelected((current) => (current + 1) % items.length),
      7000
    );
    return () => window.clearTimeout(timer);
  }, [
    items.length,
    selected,
    paused,
    reducedMotion,
    autoRotate,
    pageVisible,
    cycle,
  ]);

  if (items.length === 0) return null;
  const selectedIndex = Math.min(selected, items.length - 1);
  const active = items[selectedIndex];
  const goTo = (index: number) => {
    setSelected((index + items.length) % items.length);
    setCycle((current) => current + 1);
  };

  return (
    <section
      className={styles.spotlight}
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setPaused(false);
      }}
    >
      <div key={active.id} className={styles.spotlightScene}>
        {(active.backdrop || active.cover) && (
          // eslint-disable-next-line @next/next/no-img-element -- Native images share the cached art with the poster and avoid additional image proxy requests.
          <img
            className={styles.spotlightBackdrop}
            src={active.backdrop || active.cover}
            alt=""
            decoding="async"
          />
        )}
        <div className={styles.spotlightShade} />
        <div className={styles.spotlightCopy}>
          <span className={styles.spotlightEyebrow}>{label}</span>
          <h1>{active.title}</h1>
          <p className={styles.spotlightMeta}>{active.meta}</p>
          <p className={styles.spotlightSummary}>{active.summary}</p>
          <Link href={active.href} passHref>
            <a className={styles.spotlightCta}>
              <PlayIcon className="h-5 w-5" aria-hidden />
              {ctaLabel}
            </a>
          </Link>
        </div>
        {active.cover && (
          // eslint-disable-next-line @next/next/no-img-element -- The hero uses the provider's cover art directly.
          <img
            className={styles.spotlightPoster}
            src={active.cover}
            alt=""
            decoding="async"
          />
        )}
      </div>
      {items.length > 1 && (
        <div className={styles.spotlightNavigation}>
          <div
            className={styles.spotlightPicks}
            aria-label={`Choose ${label.toLowerCase()}`}
          >
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.spotlightPick} ${
                  index === selectedIndex ? styles.spotlightPickActive : ''
                }`}
                aria-label={`Feature ${item.title}`}
                aria-pressed={index === selectedIndex}
                onClick={() => goTo(index)}
              >
                <span className={styles.pickNumber}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span>{item.title}</span>
              </button>
            ))}
          </div>
          <div className={styles.spotlightArrows}>
            <button
              type="button"
              aria-label={`Previous ${label.toLowerCase()}`}
              onClick={() => goTo(selectedIndex - 1)}
            >
              <ChevronLeftIcon className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Next ${label.toLowerCase()}`}
              onClick={() => goTo(selectedIndex + 1)}
            >
              <ChevronRightIcon className="h-5 w-5" aria-hidden />
            </button>
            {!reducedMotion && (
              <button
                type="button"
                aria-label={
                  autoRotate
                    ? 'Pause featured rotation'
                    : 'Play featured rotation'
                }
                aria-pressed={!autoRotate}
                onClick={() => setAutoRotate((current) => !current)}
              >
                {autoRotate ? (
                  <PauseIcon className="h-5 w-5" aria-hidden />
                ) : (
                  <PlayIcon className="h-5 w-5" aria-hidden />
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default FeaturedBanner;
