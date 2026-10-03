import React, { useRef } from 'react';

import { AnimeBannerFragment } from '@animeflix/api/aniList';
import { EpisodesListFragment } from '@animeflix/api/kitsu';

import EpisodeCard from '@components/anime/Episode';

export interface SectionProps {
  anime: AnimeBannerFragment;
  episodes: EpisodesListFragment;
}

const Section: React.FC<SectionProps> = ({ anime, episodes }) => {
  const animeListRef = useRef<HTMLDivElement>(null);

  const count = episodes.episodeCount > 8 ? 8 : episodes.episodeCount;

  return (
    <section className="mt-10">
      <h2 className="mb-3 px-4 font-display text-xl font-extrabold tracking-tight text-fg sm:px-6 sm:text-2xl lg:px-8">
        Episodes
      </h2>

      <div className="edge-fade-x">
        <div
          tabIndex={0}
          ref={animeListRef}
          onMouseEnter={() => animeListRef.current?.focus()}
          className="flex snap-x gap-4 overflow-x-auto overflow-y-hidden scroll-smooth px-4 pb-3 outline-none scrollbar-hide sm:px-6 lg:px-8"
        >
          {new Array(count).fill(1).map((_v, i) => (
            <EpisodeCard
              key={i + 1}
              anime={anime}
              number={i + 1}
              episode={episodes.episodes.nodes[i]}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Section;
