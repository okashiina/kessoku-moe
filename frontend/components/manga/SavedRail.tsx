import { useSyncExternalStore } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import {
  listSavedManga,
  MANGA_LIST_EMPTY,
  subscribeMangaList,
} from '@utility/mangaList';

// "My list" rail on the manga home: series the user bookmarked (mangaList),
// distinct from "Continue reading" (mangaProgress). Client-only; hidden when empty.
const SavedRail: React.FC = () => {
  const saved = useSyncExternalStore(
    subscribeMangaList,
    listSavedManga,
    () => MANGA_LIST_EMPTY
  );

  if (!saved.length) return null;

  return (
    <section className="mt-10">
      <div className="mb-3">
        <h2 className="font-display text-lg font-extrabold tracking-tight text-fg">
          My list
        </h2>
      </div>

      <div className="edge-fade-x -mx-[5%] px-[5%]">
        <div className="flex snap-x gap-4 overflow-x-auto pb-3 scrollbar-hide">
          {saved.map((m) => (
            <Link key={m.id} href={`/manga/${m.id}`} passHref>
              <a className="group block w-36 shrink-0 snap-start sm:w-44">
                <div
                  style={{ aspectRatio: '2 / 3' }}
                  className="relative w-full overflow-hidden rounded-lg bg-surface ring-1 ring-line/40 transition group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-accent/50"
                >
                  {m.cover && (
                    <Image
                      alt={m.title}
                      src={m.cover}
                      layout="fill"
                      objectFit="cover"
                    />
                  )}
                </div>
                <p className="mt-2.5 text-sm font-semibold leading-snug text-fg transition line-clamp-2 group-hover:text-accent">
                  {m.title}
                </p>
              </a>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SavedRail;
