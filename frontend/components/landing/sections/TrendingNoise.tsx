import Link from 'next/link';

import type { AnimeInfoFragment } from '@animeflix/api/aniList';
import { ArrowRightIcon } from '@heroicons/react/solid';
import { motion } from 'framer-motion';

import Section from '@components/anime/Section';
import useReducedMotion from '@hooks/useReducedMotion';

import styles from './TrendingNoise.module.css';

export interface TrendingNoiseProps {
  trending: AnimeInfoFragment[];
}

const TrendingNoise = ({ trending }: TrendingNoiseProps) => {
  const reduced = useReducedMotion();

  if (trending.length === 0) return null;

  const link = (
    <>
      See the full lineup <ArrowRightIcon aria-hidden />
    </>
  );

  return (
    <section className={styles.trending} data-sc-act="flow">
      <Section
        title="On repeat right now"
        animeList={trending.slice(0, 12) as AnimeInfoFragment[]}
      />
      <Link href="/browse?sort=TRENDING_DESC">
        {reduced ? (
          <a className={styles.textLink}>{link}</a>
        ) : (
          <motion.a
            className={styles.textLink}
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
          >
            {link}
          </motion.a>
        )}
      </Link>
    </section>
  );
};

export default TrendingNoise;
