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
      <div className="mb-3">
        <h2 className="min-w-0 truncate font-display text-lg font-extrabold tracking-tight text-fg">
          {title}
        </h2>
      </div>

      <div className="edge-fade-x -mx-[5%] px-[5%]">
        <div
          tabIndex={0}
          ref={listRef}
          onMouseEnter={() => listRef.current?.focus()}
          className="flex snap-x gap-4 overflow-x-auto overflow-y-hidden scroll-smooth pb-3 outline-none scrollbar-hide"
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
