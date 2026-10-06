import { useRef } from 'react';

import Link from 'next/link';

import { ArrowRightIcon } from '@heroicons/react/solid';
import { motion, useScroll, useTransform } from 'framer-motion';

import useReducedMotion from '@hooks/useReducedMotion';

import styles from './CompanionSpread.module.css';

export interface CompanionSpreadProps {
  companion: React.ReactNode;
}

export default function CompanionSpread({ companion }: CompanionSpreadProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  const copyY = useTransform(scrollYProgress, [0, 1], [28, -12]);
  const demoY = useTransform(scrollYProgress, [0, 1], [48, 0]);

  const copy = (
    <div className={styles.featureCopy}>
      <p className={styles.kicker}>BETTER WITH A SEAT-MATE</p>
      <h2>
        Meet your
        <br />
        seat-mate.
      </h2>
      <p>
        Ask about what you&apos;ve seen. Pick a tone, from thoughtful to
        completely off the rails.
      </p>
      <Link href="/home">
        <a className={styles.textLink}>
          Find an anime <ArrowRightIcon aria-hidden />
        </a>
      </Link>
    </div>
  );

  const demo = (
    <div className={styles.demo}>
      <span className={styles.demoLabel}>A LITTLE PREVIEW · TRY A TONE</span>
      {companion}
    </div>
  );

  return (
    <section
      ref={sectionRef}
      className={styles.featureSpread}
      data-sc-act="flow"
    >
      {reduced ? (
        <>
          {copy}
          {demo}
        </>
      ) : (
        <>
          <motion.div className={styles.motionPanel} style={{ y: copyY }}>
            {copy}
          </motion.div>
          <motion.div className={styles.motionPanel} style={{ y: demoY }}>
            {demo}
          </motion.div>
        </>
      )}
    </section>
  );
}
