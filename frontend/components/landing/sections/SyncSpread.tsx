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
    <section className={`${styles.featureSpread} ${styles.syncSpread}`}>
      <div className={styles.featureCopy}>
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
      </div>
      <motion.div
        className={styles.demo}
        initial={reduced ? false : { opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: reduced ? 0 : 0.35, ease: EASE }}
      >
        <span className={styles.demoLabel}>ANILIST SYNC · EXAMPLE</span>
        {sync}
      </motion.div>
    </section>
  );
}
