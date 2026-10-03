import Link from 'next/link';

import { ArrowRightIcon } from '@heroicons/react/solid';

import CoverflowCarousel from '@components/home/CoverflowCarousel';
import type { CartoonSuggestion } from '@utility/cartoon';

import styles from './CartoonSpread.module.css';

export default function CartoonSpread({
  cartoons,
}: {
  cartoons: CartoonSuggestion[];
}) {
  return (
    <section
      id="cartoons"
      className={styles.cartoonSpread}
      aria-labelledby="cartoon-heading"
    >
      <div className={styles.copy}>
        <p className={styles.kicker}>A NEW CORNER OF THE SETLIST</p>
        <h2 id="cartoon-heading">
          Cartoons
          <br />
          take the stage.
        </h2>
        <p className={styles.description}>
          Watch cartoon favorites like Ben 10 and discover your next adventure.
          Find a series, choose an episode, and bring an AI companion along.
          Your last season and episode are saved for next time.
        </p>
        <Link href="/cartoon">
          <a className={styles.primary}>
            Browse cartoons <ArrowRightIcon aria-hidden />
          </a>
        </Link>
      </div>
      <div className={styles.ticket} aria-hidden="true">
        <span className={styles.ticketTop}>NOW ON THE BILL</span>
        <span className={styles.ticketTitle}>
          CARTOON
          <br />
          CLUB
        </span>
        <span className={styles.ticketRule} />
        <span className={styles.ticketBottom}>
          SEASONS · STORIES · SIDEKICKS
        </span>
        <span className={styles.ticketMark}>k!</span>
      </div>
      {cartoons.length > 0 && (
        <CoverflowCarousel
          className={styles.catalog}
          label="A few from the cartoon lineup"
          ariaLabel="Cartoon catalog preview"
          showNavigation
          slides={cartoons.map((show) => ({
            src: show.cover || '',
            alt: show.name,
            title: show.name,
            subtitle: show.year || 'Cartoon',
            href: `/cartoon/${show.id}`,
          }))}
        />
      )}
    </section>
  );
}
