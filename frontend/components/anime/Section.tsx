import React, { useRef } from 'react';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/outline';

import AnimeCard from '@components/anime/Card';

export interface SectionProps {
  title: string;
  animeList: AnimeInfoFragment[];
}

const Section: React.FC<SectionProps> = ({ title, animeList }) => {
  const animeListRef = useRef<HTMLDivElement>(null);

  return (
    <section className="mt-10 first:mt-8">
      <div className="mb-3 flex items-center gap-2.5 px-4 sm:px-6 lg:px-8">
        <h2 className="min-w-0 truncate font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
          {title}
        </h2>
        <div className="ml-auto flex shrink-0 gap-2">
          <button
            type="button"
            aria-label={`Previous titles in ${title}`}
            onClick={() =>
              animeListRef.current?.scrollBy({
                left: -animeListRef.current.clientWidth * 0.8,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                  .matches
                  ? 'auto'
                  : 'smooth',
              })
            }
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-fg hover:bg-surface"
          >
            <ChevronLeftIcon className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label={`Next titles in ${title}`}
            onClick={() =>
              animeListRef.current?.scrollBy({
                left: animeListRef.current.clientWidth * 0.8,
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                  .matches
                  ? 'auto'
                  : 'smooth',
              })
            }
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-fg hover:bg-surface"
          >
            <ChevronRightIcon className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="edge-fade-x">
        <div
          tabIndex={0}
          role="region"
          aria-label={`${title} anime`}
          ref={animeListRef}
          className="flex snap-x gap-4 overflow-x-auto overflow-y-hidden scroll-smooth px-4 pb-3 outline-none scrollbar-hide sm:px-6 lg:px-8"
        >
          {animeList.map((anime) => (
            <AnimeCard key={anime.id} anime={anime} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Section;
