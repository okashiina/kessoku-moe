import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { AnimeInfoFragment } from '@animeflix/api/aniList';

import HomePoster from '@components/home/HomePoster';
import PosterRow, { PosterRowItem } from '@components/home/PosterRow';
import useWatchlist from '@hooks/useWatchlist';
import styles from '@styles/Home.module.css';
import { getAllAnimeByIds } from '@utility/animeByIds';
import { effectiveStatus, subscribeStatus } from '@utility/listStatus';
import { subscribeProgress } from '@utility/progress';
import { subscribeWatchlist } from '@utility/watchlist';

const subscribeAll = (cb: () => void): (() => void) => {
  const unsubs = [
    subscribeStatus(cb),
    subscribeProgress(cb),
    subscribeWatchlist(cb),
  ];
  return () => unsubs.forEach((u) => u());
};

const EMPTY_PLANNING = '';

const tiltAt = (i: number): 'left' | 'right' | 'none' =>
  i % 2 === 0 ? 'left' : 'right';

const WatchLaterRail: React.FC = () => {
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

  const planningKey = useSyncExternalStore(
    subscribeAll,
    () =>
      idKey
        .split(',')
        .filter(Boolean)
        .filter((id) => effectiveStatus(Number(id)) === 'PLANNING')
        .join(','),
    () => EMPTY_PLANNING
  );

  const planning = useMemo(() => {
    const allow = new Set(planningKey.split(',').filter(Boolean));
    return media.filter((anime) => allow.has(String(anime.id)));
  }, [media, planningKey]);

  if (planning.length === 0) return null;

  const shown = planning.slice(0, 4);

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeading}>
        <h2 className="min-w-0 truncate font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
          Watch Later
        </h2>
      </div>

      <PosterRow className={styles.watchLaterRow}>
        {shown.map((anime, i) => (
          <PosterRowItem key={anime.id}>
            <HomePoster anime={anime} tilt={tiltAt(i)} />
          </PosterRowItem>
        ))}
      </PosterRow>
    </section>
  );
};

export default WatchLaterRail;
