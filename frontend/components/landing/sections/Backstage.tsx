import Link from 'next/link';

import { ArrowRightIcon, BookOpenIcon, PlayIcon } from '@heroicons/react/solid';
import { motion } from 'framer-motion';

import useReducedMotion from '@hooks/useReducedMotion';

import styles from './Backstage.module.css';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const FeatureCard = ({
  children,
  delay = 0,
}: {
  children: React.ReactNode;
  delay?: number;
}) => {
  const reduced = useReducedMotion();

  if (reduced) {
    return <div>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
};

const Backstage = () => (
  <section id="backstage" className={styles.backstage}>
    <div className={styles.sectionIntro}>
      <h2>
        A little more
        <br />
        than pressing play.
      </h2>
      <p>
        From the opening song to the chapter you fell asleep on, keep the good
        parts close.
      </p>
    </div>
    <div className={styles.featureIndex}>
      <FeatureCard>
        <Link href="/home">
          <a>
            <PlayIcon aria-hidden />
            <h3>Find your next obsession.</h3>
            <p>
              Trending anime, seasonal picks, and a place to pick up where you
              left off.
            </p>
            <span>
              Explore anime <ArrowRightIcon aria-hidden />
            </span>
          </a>
        </Link>
      </FeatureCard>
      <FeatureCard delay={0.12}>
        <Link href="/manga">
          <a>
            <BookOpenIcon aria-hidden />
            <h3>Just one more chapter.</h3>
            <p>
              Manga and manhwa, with paged or webtoon reading and your spot
              saved.
            </p>
            <span>
              Open the reader <ArrowRightIcon aria-hidden />
            </span>
          </a>
        </Link>
      </FeatureCard>
    </div>
  </section>
);

export default Backstage;
