import { useRef } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { ArrowRightIcon, PlayIcon } from '@heroicons/react/solid';
import { motion, useScroll, useTransform } from 'framer-motion';

import useReducedMotion from '@hooks/useReducedMotion';
import { MediaInfo } from '@utility/anilist';

import styles from './HeroPoster.module.css';

export interface HeroPosterProps {
  picks: MediaInfo[];
}

const HeroPoster = ({ picks }: HeroPosterProps) => {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });
  // Every cover is visible at rest. Desktop parallax only moves transforms;
  // CSS disables it on phones without a hydration-time layout switch.
  const leftY = useTransform(scrollYProgress, [0, 1], [0, -24]);
  const middleY = useTransform(scrollYProgress, [0, 1], [0, 20]);
  const rightY = useTransform(scrollYProgress, [0, 1], [0, -12]);
  const posterY = [leftY, middleY, rightY];

  return (
    <section
      ref={sectionRef}
      className={styles.hero}
      aria-labelledby="hero-heading"
    >
      <div className={styles.heroCopy}>
        <p className={styles.kicker}>
          <span aria-hidden className={styles.dot} /> DARK. CUTE. A LITTLE ROCK.
        </p>
        <h1 id="hero-heading">
          Your kind
          <br />
          of <span>noise.</span>
        </h1>
        <p className={styles.categories}>Anime. Manga. Cartoons. All here.</p>
      </div>
      <div className={styles.posterWall}>
        <span className={styles.posterStamp} aria-hidden="true">
          結束
          <small>AFTER HOURS CLUB</small>
        </span>
        {picks.map((item, i) => (
          <div key={item.id} className={styles.heroPoster} data-position={i}>
            <motion.div
              className={styles.posterSlide}
              style={reduced ? undefined : { y: posterY[i] }}
            >
              <Image
                src={
                  item.coverImage.extraLarge ||
                  item.coverImage.large ||
                  item.coverImage.medium ||
                  ''
                }
                alt={`Cover for ${item.title.english || item.title.romaji}`}
                layout="fill"
                objectFit="cover"
                priority
                sizes="(max-width: 700px) 40vw, (max-width: 1050px) 24vw, 300px"
              />
            </motion.div>
          </div>
        ))}
        {!picks.length && (
          // eslint-disable-next-line @next/next/no-img-element -- existing brand asset when catalog art is unavailable
          <img
            className={styles.fallbackLogo}
            src="/kessoku-moe-icon.svg"
            alt="kessoku moe"
            width="240"
            height="240"
          />
        )}
        <div className={styles.posterCaption}>
          <span>ONE MORE EPISODE. ONE MORE CHAPTER.</span>
          <strong>the night is yours.</strong>
        </div>
        <span className={styles.sticker} aria-hidden="true">
          PRESS PLAY.
          <br />
          STAY A WHILE.
        </span>
      </div>
      <div className={styles.heroDetails}>
        <p className={styles.intro}>
          Find your next obsession. Keep your place.
          <br />
          Bring a little company along.
        </p>
        <div className={styles.actions}>
          <Link href="/home">
            <a className={styles.primary}>
              <PlayIcon aria-hidden /> Start watching{' '}
              <ArrowRightIcon aria-hidden />
            </a>
          </Link>
          <Link href="/manga">
            <a className={styles.textLink}>
              Or turn a page <ArrowRightIcon aria-hidden />
            </a>
          </Link>
        </div>
        <p className={styles.note}>
          A little corner of the internet to call your own.
        </p>
      </div>
    </section>
  );
};

export default HeroPoster;
