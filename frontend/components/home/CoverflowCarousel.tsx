import { useRef } from 'react';

import Link from 'next/link';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/outline';

import styles from '@styles/Home.module.css';

export interface CoverflowSlide {
  src: string;
  alt: string;
  title?: string;
  subtitle?: string;
  href?: string;
}

interface CoverflowCarouselProps {
  slides: CoverflowSlide[];
  label?: string;
  ariaLabel?: string;
  className?: string;
  showNavigation?: boolean;
  showPagination?: boolean;
}

/** A native horizontal rail. The retained name keeps existing callers stable. */
const CoverflowCarousel: React.FC<CoverflowCarouselProps> = ({
  slides,
  label,
  ariaLabel,
  className,
  showNavigation = false,
}) => {
  const railRef = useRef<HTMLDivElement>(null);

  if (slides.length === 0) return null;

  const scroll = (direction: number) => {
    railRef.current?.scrollBy({
      left: direction * Math.max(railRef.current.clientWidth * 0.75, 220),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  };

  const Root: 'section' | 'div' = label ? 'section' : 'div';

  return (
    <Root className={className}>
      {(label || showNavigation) && (
        <div className={styles.posterRailHeading}>
          {label && <h2 className={styles.posterRailTitle}>{label}</h2>}
          {showNavigation && slides.length > 1 && (
            <div className={styles.posterRailControls}>
              <button
                type="button"
                onClick={() => scroll(-1)}
                aria-label="Scroll posters left"
              >
                <ChevronLeftIcon className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => scroll(1)}
                aria-label="Scroll posters right"
              >
                <ChevronRightIcon className="h-5 w-5" aria-hidden />
              </button>
            </div>
          )}
        </div>
      )}

      <div
        ref={railRef}
        className={styles.posterRail}
        role="region"
        aria-label={ariaLabel || label || 'Anime posters'}
        tabIndex={0}
      >
        {slides.map((slide, index) => (
          <Link
            key={`${slide.href ?? slide.alt}-${index}`}
            href={slide.href || '#'}
            passHref
          >
            <a className={styles.posterRailItem}>
              <span className={styles.posterRailArt}>
                <span className={styles.posterRailPlaceholder}>
                  {slide.title || slide.alt}
                </span>
                {slide.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={slide.src} alt="" loading="lazy" />
                ) : null}
              </span>
              <span className={styles.posterRailName}>
                {slide.title || slide.alt}
              </span>
              {slide.subtitle && (
                <span className={styles.posterRailMeta}>{slide.subtitle}</span>
              )}
            </a>
          </Link>
        ))}
      </div>
    </Root>
  );
};

export default CoverflowCarousel;
