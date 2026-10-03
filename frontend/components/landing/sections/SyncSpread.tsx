import Link from 'next/link';

import { ArrowRightIcon } from '@heroicons/react/solid';
import { motion } from 'framer-motion';

import { EASE } from '@components/motion/Reveal';
import useReducedMotion from '@hooks/useReducedMotion';

import styles from './SyncSpread.module.css';

export interface SyncSpreadProps {
  sync: React.ReactNode;
}

export default function SyncSpread({ sync }: SyncSpreadProps) {
  const reduced = useReducedMotion();

  return (
    <section
      className={`${styles.featureSpread} ${styles.syncSpread}`}
      data-sc-act="flow"
    >
      <motion.div
        className={styles.demo}
        initial={reduced ? false : { clipPath: 'inset(0 100% 0 0)' }}
        whileInView={{ clipPath: 'inset(0 0% 0 0)' }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{
          duration: reduced ? 0 : 0.6,
          ease: EASE,
        }}
      >
        <span className={styles.demoLabel}>ANILIST SYNC · EXAMPLE</span>
        {sync}
      </motion.div>
      <motion.div
        className={styles.featureCopy}
        initial={reduced ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{
          duration: reduced ? 0 : 0.55,
          ease: EASE,
          delay: reduced ? 0 : 0.15,
        }}
      >
        <h2>
          Your list.
          <br />
          Still in tune.
        </h2>
        <p>
          Save what catches your eye. Connect AniList to keep your anime
          progress together, episode after episode.
        </p>
        <Link href="/watchlist">
          <a className={styles.textLink}>
            Open My List <ArrowRightIcon aria-hidden />
          </a>
        </Link>
      </motion.div>
    </section>
  );
}
