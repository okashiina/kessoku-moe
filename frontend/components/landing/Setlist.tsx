import Link from 'next/link';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { ArrowRightIcon } from '@heroicons/react/solid';

import { MediaInfo } from '@utility/anilist';
import type { CartoonSuggestion } from '@utility/cartoon';

import Backstage from './sections/Backstage';
import BandStrip from './sections/BandStrip';
import CartoonSpread from './sections/CartoonSpread';
import ClosePlate from './sections/ClosePlate';
import CompanionSpread from './sections/CompanionSpread';
import HeroPoster from './sections/HeroPoster';
import Lineup from './sections/Lineup';
import SyncSpread from './sections/SyncSpread';
import TrendingNoise from './sections/TrendingNoise';
import styles from './Setlist.module.css';

interface SetlistProps {
  trending: MediaInfo[];
  featured: MediaInfo[];
  companion: React.ReactNode;
  sync: React.ReactNode;
  cartoons: CartoonSuggestion[];
}

const Setlist = ({
  trending,
  featured,
  companion,
  sync,
  cartoons,
}: SetlistProps) => {
  const picks = (featured.length ? featured : trending)
    .filter((item) => item.coverImage.large || item.coverImage.medium)
    .slice(0, 3);
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.nav}>
        <Link href="/">
          <a className={styles.brand} aria-label="kessoku moe home">
            {/* eslint-disable-next-line @next/next/no-img-element -- existing static SVG brand mark */}
            <img src="/kessoku-moe-icon.svg" alt="" width="34" height="34" />
            kessoku<span>moe</span>
          </a>
        </Link>
        <nav aria-label="Main navigation">
          <a href="#backstage">Backstage</a>
          <Link href="/browse">
            <a>Browse anime</a>
          </Link>
          <Link href="/manga">
            <a>Manga</a>
          </Link>
        </nav>
        <Link href="/home">
          <a className={styles.navCta}>
            Take your seat <ArrowRightIcon aria-hidden />
          </a>
        </Link>
      </header>
      <main id="main">
        <HeroPoster picks={picks} />
        <BandStrip />
        <Backstage />
        <Lineup picks={picks} />
        <CompanionSpread companion={companion} />
        <SyncSpread sync={sync} />
        <TrendingNoise trending={trending as AnimeInfoFragment[]} />
        <CartoonSpread cartoons={cartoons} />
        <ClosePlate />
      </main>
      <footer className={styles.footer}>
        <Link href="/">
          <a>kessoku moe</a>
        </Link>
        <p>Made for the nights you say, “just one more.”</p>
        <Link href="/schedule">
          <a>
            Airing schedule <ArrowRightIcon aria-hidden />
          </a>
        </Link>
      </footer>
    </div>
  );
};

export default Setlist;
