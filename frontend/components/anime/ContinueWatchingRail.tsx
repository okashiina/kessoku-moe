import { useEffect, useState } from 'react';

import { AnimeInfoFragment } from '@animeflix/api/aniList';

import ContinueWatchingCard from '@components/anime/ContinueWatchingCard';
import useWatchHistory from '@hooks/useWatchHistory';
import styles from '@styles/Home.module.css';
import { getAllAnimeByIds } from '@utility/animeByIds';

const ContinueWatchingRail: React.FC = () => {
  const items = useWatchHistory();
  const [animeById, setAnimeById] = useState<Record<number, AnimeInfoFragment>>(
    {}
  );

  const idKey = items.map((item) => item.id).join(',');

  useEffect(() => {
    const ids = idKey
      .split(',')
      .filter(Boolean)
      .map((id) => Number(id));

    let cancelled = false;

    if (ids.length > 0) {
      getAllAnimeByIds(ids)
        .then((media) => {
          if (cancelled) return;
          const next: Record<number, AnimeInfoFragment> = {};
          media.forEach((anime) => {
            next[anime.id] = anime;
          });
          setAnimeById(next);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [idKey]);

  const cards = items
    .map((item) => ({ item, anime: animeById[item.id] }))
    .filter((row) => row.anime);

  if (cards.length === 0) return null;

  return (
    <section className={styles.section} aria-label="Continue watching">
      <div className={styles.sectionHeading}>
        <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
          Continue watching
        </h2>
      </div>

      <div
        tabIndex={0}
        aria-label="Continue watching titles, scroll horizontally for more"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-hidden pb-2 outline-none scrollbar-hide focus-visible:ring-2 focus-visible:ring-accent"
      >
        {cards.map(({ item, anime }) => (
          <ContinueWatchingCard
            key={item.id}
            anime={anime}
            entry={item.entry}
          />
        ))}
      </div>
    </section>
  );
};

export default ContinueWatchingRail;
