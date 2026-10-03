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

/** Deck pose — all three posters stacked at wall center */
const FAN_START = {
  top: '16.5%',
  left: '26.5%',
  rotate: -2,
  scale: 0.96,
  width: '47%',
  height: '67%',
} as const;

/** Scattered end poses (left % derived from right:-5% on poster 2) */
const FAN_END = [
  {
    top: '21%',
    left: '-3%',
    rotate: -9,
    scale: 1,
    width: '47%',
    height: '67%',
  },
  { top: '6%', left: '30%', rotate: 7, scale: 1, width: '47%', height: '67%' },
  {
    top: '35%',
    left: '64%',
    rotate: 12,
    scale: 1,
    width: '41%',
    height: '59%',
  },
] as const;

function usePosterFan(
  scrollYProgress: ReturnType<typeof useScroll>['scrollYProgress'],
  index: number
) {
  const end = FAN_END[index];
  return {
    top: useTransform(scrollYProgress, [0, 1], [FAN_START.top, end.top]),
    left: useTransform(scrollYProgress, [0, 1], [FAN_START.left, end.left]),
    rotate: useTransform(
      scrollYProgress,
      [0, 1],
      [FAN_START.rotate, end.rotate]
    ),
    scale: useTransform(scrollYProgress, [0, 1], [FAN_START.scale, end.scale]),
    width: useTransform(scrollYProgress, [0, 1], [FAN_START.width, end.width]),
    height: useTransform(
      scrollYProgress,
      [0, 1],
      [FAN_START.height, end.height]
    ),
  };
}

const HeroPoster = ({ picks }: HeroPosterProps) => {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end start'],
  });

  const fan0 = usePosterFan(scrollYProgress, 0);
  const fan1 = usePosterFan(scrollYProgress, 1);
  const fan2 = usePosterFan(scrollYProgress, 2);
  const fanTransforms = [fan0, fan1, fan2];

  const stampY = useTransform(scrollYProgress, [0, 1], [0, -24]);
  const stickerY = useTransform(scrollYProgress, [0, 1], [0, 28]);

  return (
    <section
      ref={sectionRef}
      className={`${styles.hero} ${reduced ? styles.heroReduced : ''}`}
      data-sc-act="flow"
    >
      <div className={styles.heroCopy}>
        <p className={styles.kicker}>
          <span aria-hidden className={styles.dot} /> DARK. CUTE. A LITTLE ROCK.
        </p>
        <h1>
          Anime &amp; manga.
          <br />
          Your kind
          <br />
          of <span>noise.</span>
        </h1>
        <p className={styles.intro}>
          One more episode. One more chapter.
          <br />A little corner of the internet to call your own.
        </p>
        <div className={styles.actions}>
          <Link href="/home">
            <a className={styles.primary}>
              <PlayIcon aria-hidden />
              Start watching
            </a>
          </Link>
          <Link href="/manga">
            <a className={styles.textLink}>
              Or turn a page <ArrowRightIcon aria-hidden />
            </a>
          </Link>
        </div>
        <p className={styles.note}>Watch anime. Read manga. Keep your place.</p>
      </div>
      <div className={styles.posterWall}>
        <motion.span
          className={styles.posterStamp}
          style={reduced ? undefined : { y: stampY }}
        >
          結束
          <br />
          <small>AFTER HOURS CLUB</small>
        </motion.span>
        {picks.map((item, i) => (
          <motion.div
            key={item.id}
            className={styles.heroPoster}
            data-position={i}
            style={
              reduced
                ? undefined
                : {
                    top: fanTransforms[i].top,
                    left: fanTransforms[i].left,
                    right: 'auto',
                    rotate: fanTransforms[i].rotate,
                    scale: fanTransforms[i].scale,
                    width: fanTransforms[i].width,
                    height: fanTransforms[i].height,
                  }
            }
          >
            <div className={styles.posterSlide}>
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
                sizes="(max-width: 700px) 44vw, 300px"
              />
            </div>
          </motion.div>
        ))}
        {!picks.length && (
          // eslint-disable-next-line @next/next/no-img-element -- static SVG fallback for unavailable catalog art
          <img
            className={styles.fallbackLogo}
            src="/kessoku-moe-icon.svg"
            alt="kessoku moe"
          />
        )}
        <div className={styles.posterCaption}>
          <span>ANIME / MANGA / GOOD COMPANY</span>
          <strong>the night is yours.</strong>
        </div>
        <motion.div
          className={styles.stickerLayer}
          style={reduced ? undefined : { y: stickerY }}
        >
          <span className={styles.sticker}>
            PRESS PLAY.
            <br />
            STAY A WHILE.
          </span>
        </motion.div>
      </div>
    </section>
  );
};

export default HeroPoster;
