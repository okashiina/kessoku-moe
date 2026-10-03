import { useEffect, useState } from 'react';

import Link from 'next/link';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { ArrowRightIcon } from '@heroicons/react/outline';

import HomePoster from '@components/home/HomePoster';
import PosterRow, { PosterRowItem } from '@components/home/PosterRow';
import useWatchlist from '@hooks/useWatchlist';
import styles from '@styles/Home.module.css';
import { getAllAnimeByIds } from '@utility/animeByIds';

const tiltAt = (i: number): 'left' | 'right' | 'none' =>
  i % 2 === 0 ? 'left' : 'right';

const MyListRail: React.FC = () => {
  const ids = useWatchlist();
  const [media, setMedia] = useState<AnimeInfoFragment[]>([]);

  const idKey = ids.join(',');

  useEffect(() => {
    const list = idKey
      .split(',')
      .filter(Boolean)
      .map((id) => Number(id));

    let cancelled = false;

    if (list.length === 0) {
      setMedia([]);
    } else {
      getAllAnimeByIds(list)
        .then((resolved) => {
          if (!cancelled) setMedia(resolved);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [idKey]);

  if (ids.length === 0 || media.length === 0) return null;

  const shown = media.slice(0, 8);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <h2 className="min-w-0 truncate font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
          My List
        </h2>
        <Link href="/watchlist" passHref>
          <a className="ml-auto inline-flex min-h-[44px] items-center gap-2.5 whitespace-nowrap text-[13px] font-bold text-accent">
            See all
            <ArrowRightIcon className="h-5 w-5" aria-hidden />
          </a>
        </Link>
      </div>

      <PosterRow className={styles.myListRow}>
        {shown.map((anime, i) => (
          <PosterRowItem key={anime.id}>
            <HomePoster anime={anime} tilt={tiltAt(i)} />
          </PosterRowItem>
        ))}
      </PosterRow>
    </section>
  );
};

export default MyListRail;
