import { useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/outline';

import CoverflowCarousel, {
  CoverflowSlide,
} from '@components/home/CoverflowCarousel';
import { coverSrc } from '@components/home/HomePoster';
import useRecommendations from '@hooks/useRecommendations';
import styles from '@styles/Home.module.css';
import { pickTitle, useTitleLang } from '@utility/titleLang';

const RecommendationRails: React.FC = () => {
  const { forYou, because } = useRecommendations();
  const lang = useTitleLang();
  const [selected, setSelected] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  if (forYou.length === 0 && (!because || because.items.length === 0)) {
    return null;
  }

  const selectedIndex = Math.min(selected, forYou.length - 1);
  const active = forYou[selectedIndex];
  const activeCover = active ? coverSrc(active.coverImage) : '';
  const activeTitle = active ? pickTitle(active.title, lang) : '';
  const nextIndices = Array.from(
    { length: Math.min(3, Math.max(0, forYou.length - 1)) },
    (_, offset) => (selectedIndex + offset + 1) % forYou.length
  );
  const becauseTitle = because ? pickTitle(because.title, lang) : '';
  const becauseSlides: CoverflowSlide[] = (because?.items || [])
    .slice(0, 10)
    .map((anime) => ({
      src: coverSrc(anime.coverImage),
      alt: pickTitle(anime.title, lang),
      title: pickTitle(anime.title, lang),
      subtitle: anime.format || undefined,
      href: `/anime/${anime.id}`,
    }));

  const step = (offset: number) => {
    setDirection(offset < 0 ? -1 : 1);
    setSelected(
      (current) =>
        (Math.min(current, forYou.length - 1) + offset + forYou.length) %
        forYou.length
    );
  };

  return (
    <>
      {active && (
        <section
          className={`${styles.section} ${styles.recommendationSection}`}
        >
          <div className={styles.recommendationHeading}>
            <div>
              <h2>Recommended for you</h2>
              <p>Fresh picks from the anime you watch and save.</p>
            </div>
            <span className={styles.recommendationCount}>
              {String(selectedIndex + 1).padStart(2, '0')} /{' '}
              {String(forYou.length).padStart(2, '0')}
            </span>
          </div>

          <div className={styles.recommendationLayout}>
            <div
              className={`${styles.recommendationFeature} ${
                direction < 0 ? styles.recommendationBackward : ''
              }`}
            >
              <div
                key={`cover-${active.id}`}
                className={styles.recommendationCover}
              >
                {activeCover && (
                  <Image
                    src={activeCover}
                    alt=""
                    layout="fill"
                    objectFit="cover"
                    sizes="(max-width: 700px) 38vw, 210px"
                  />
                )}
              </div>
              <div
                key={`copy-${active.id}`}
                className={styles.recommendationCopy}
              >
                <span className={styles.recommendationEyebrow}>
                  Your next watch
                </span>
                <h3>{activeTitle}</h3>
                <p className={styles.recommendationMeta}>
                  {[
                    active.format,
                    active.episodes && `${active.episodes} episodes`,
                    active.meanScore && `${active.meanScore}% score`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <Link href={`/anime/${active.id}`} passHref>
                  <a className={styles.recommendationCta}>
                    Explore anime
                    <ChevronRightIcon className="h-5 w-5" aria-hidden />
                  </a>
                </Link>
              </div>
              {forYou.length > 1 && (
                <div className={styles.recommendationControls}>
                  <button
                    type="button"
                    aria-label="Previous recommendation"
                    onClick={() => step(-1)}
                  >
                    <ChevronLeftIcon className="h-5 w-5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Next recommendation"
                    onClick={() => step(1)}
                  >
                    <ChevronRightIcon className="h-5 w-5" aria-hidden />
                  </button>
                </div>
              )}
            </div>

            {nextIndices.length > 0 && (
              <div className={styles.recommendationQueue}>
                <p className={styles.recommendationQueueTitle}>Up next</p>
                {nextIndices.map((index) => {
                  const anime = forYou[index];
                  const title = pickTitle(anime.title, lang);
                  const cover = coverSrc(anime.coverImage);
                  return (
                    <button
                      key={anime.id}
                      type="button"
                      className={styles.recommendationQueueItem}
                      onClick={() => {
                        setDirection(1);
                        setSelected(index);
                      }}
                      aria-label={`Preview ${title}`}
                    >
                      <span className={styles.recommendationQueueCover}>
                        <span className={styles.recommendationQueuePlaceholder}>
                          {title.slice(0, 1)}
                        </span>
                        {cover && (
                          <Image
                            src={cover}
                            alt=""
                            layout="fill"
                            objectFit="cover"
                            sizes="56px"
                          />
                        )}
                      </span>
                      <span className={styles.recommendationQueueCopy}>
                        <strong>{title}</strong>
                        <small>
                          {anime.format || 'Anime'}
                          {anime.meanScore
                            ? ` · ${anime.meanScore}% score`
                            : ''}
                        </small>
                      </span>
                      <ChevronRightIcon
                        className="h-4 w-4 shrink-0"
                        aria-hidden
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {because && becauseSlides.length > 0 && becauseTitle && (
        <CoverflowCarousel
          className={styles.section}
          label={`More like ${becauseTitle}`}
          slides={becauseSlides}
          showNavigation
        />
      )}
    </>
  );
};

export default RecommendationRails;
