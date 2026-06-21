import React, { useRef } from 'react';

import MangaCard from '@components/manga/Card';
import { MangaInfo } from '@utility/manga';

export interface MangaSectionProps {
  title: string;
  mangaList: MangaInfo[];
}

const MangaSection: React.FC<MangaSectionProps> = ({ title, mangaList }) => {
  const listRef = useRef<HTMLDivElement>(null);
  if (!mangaList.length) return null;

  return (
    <section className="mt-10 first:mt-8">
      <div className="mb-3 flex items-center gap-2.5 px-4 sm:px-6 lg:px-8">
        <span className="h-5 w-1 shrink-0 rounded-full bg-aurora" aria-hidden />
        <h2 className="min-w-0 truncate font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
          {title}
        </h2>
      </div>

      <div className="edge-fade-x">
        <div
          tabIndex={0}
          ref={listRef}
          onMouseEnter={() => listRef.current?.focus()}
          className="flex snap-x gap-4 overflow-x-auto overflow-y-hidden scroll-smooth px-4 pb-3 outline-none scrollbar-hide sm:px-6 lg:px-8"
        >
          {mangaList.map((manga) => (
            <MangaCard key={manga.id} manga={manga} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default MangaSection;
