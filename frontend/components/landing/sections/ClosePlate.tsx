import Link from 'next/link';

import { ArrowRightIcon } from '@heroicons/react/solid';
import { motion } from 'framer-motion';

import useReducedMotion from '@hooks/useReducedMotion';

import styles from './ClosePlate.module.css';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const ClosePlate = () => {
  const reduced = useReducedMotion();

  return (
    <section className={styles.close}>
      <div>
        <p>YOUR SEAT IS WAITING</p>
        {reduced ? (
          <h2>
            Same time.
            <br />
            Next episode?
          </h2>
        ) : (
          <motion.h2
            initial={{ clipPath: 'inset(0 0 100% 0)' }}
            whileInView={{ clipPath: 'inset(0 0 0% 0)' }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, ease: EASE }}
          >
            Same time.
            <br />
            Next episode?
          </motion.h2>
        )}
      </div>
      {reduced ? (
        <Link href="/home">
          <a>
            Start watching <ArrowRightIcon aria-hidden />
          </a>
        </Link>
      ) : (
        <Link href="/home">
          <motion.a
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.12 }}
          >
            Start watching <ArrowRightIcon aria-hidden />
          </motion.a>
        </Link>
      )}
      {reduced ? (
        <span className={styles.closeMark} aria-hidden>
          k!
        </span>
      ) : (
        <motion.span
          className={styles.closeMark}
          aria-hidden
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 0.055, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.12 }}
        >
          k!
        </motion.span>
      )}
    </section>
  );
};

export default ClosePlate;
