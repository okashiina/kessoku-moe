import { useRef } from 'react';

import { motion, useScroll, useTransform } from 'framer-motion';

import useReducedMotion from '@hooks/useReducedMotion';

import styles from './BandStrip.module.css';

const PHRASES = (
  <>
    <span>Anime nights</span>
    <b aria-hidden>✳</b>
    <span>Manga mornings</span>
    <b aria-hidden>✳</b>
    <span>AniList sync</span>
    <b aria-hidden>✳</b>
    <span>Good company</span>
  </>
);

export default function BandStrip() {
  const stripRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: stripRef,
    offset: ['start end', 'end start'],
  });
  const x = useTransform(scrollYProgress, [0, 1], ['0%', '-50%']);

  if (reduced) {
    return (
      <div
        ref={stripRef}
        className={`${styles.bandStrip} ${styles.bandStripStatic}`}
        aria-label="Platform features"
      >
        {PHRASES}
      </div>
    );
  }

  return (
    <div
      ref={stripRef}
      className={`${styles.bandStrip} ${styles.bandStripScroll}`}
    >
      <motion.div className={styles.track} style={{ x }}>
        <div className={styles.row} aria-label="Platform features">
          {PHRASES}
        </div>
        <div className={styles.row} aria-hidden>
          {PHRASES}
        </div>
      </motion.div>
    </div>
  );
}
