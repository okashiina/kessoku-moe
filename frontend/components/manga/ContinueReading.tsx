import { useSyncExternalStore } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { XIcon } from '@heroicons/react/solid';

import {
  listMangaContinue,
  MANGA_CONTINUE_EMPTY,
  removeMangaContinue,
  subscribeMangaProgress,
} from '@utility/mangaProgress';

// "Continue reading" rail, fed from localStorage (kessoku.mangaProgress.v1).
// Client-only via useSyncExternalStore; renders nothing during SSR / when empty,
// so the library page stays a clean discovery surface for first-time visitors.

const ContinueReading: React.FC = () => {
  const items = useSyncExternalStore(
    subscribeMangaProgress,
    listMangaContinue,
    () => MANGA_CONTINUE_EMPTY
  );

  if (!items.length) return null;

  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="font-display text-lg font-extrabold tracking-tight text-fg">
          Continue reading
        </h2>
      </div>

      <div className="edge-fade-x -mx-[5%] px-[5%]">
        <div className="flex snap-x gap-4 overflow-x-auto pb-3 scrollbar-hide">
          {items.map(({ id, entry }) => {
            const pct =
              entry.pages > 0
                ? Math.min(
                    100,
                    Math.round(((entry.page + 1) / entry.pages) * 100)
                  )
                : 0;
            const href = entry.chapterId
              ? `/read/${entry.chapterId}?al=${id}`
              : `/manga/${id}`;
            return (
              <div
                key={id}
                className="relative w-60 shrink-0 snap-start overflow-hidden rounded-lg bg-surface ring-1 ring-line/40"
              >
                <Link href={href} passHref>
                  <a className="flex gap-3 p-3">
                    <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-[5px] bg-canvas-2">
                      {entry.cover && (
                        <Image
                          alt=""
                          src={entry.cover}
                          layout="fill"
                          objectFit="cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-fg line-clamp-2">
                        {entry.title || 'Untitled'}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Ch. {entry.ch}
                        {entry.pages > 0 &&
                          ` · pg ${entry.page + 1}/${entry.pages}`}
                      </p>
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-[5px] bg-line/50">
                        <div
                          className="h-full rounded-[5px] bg-accent"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </a>
                </Link>
                <button
                  type="button"
                  aria-label="Remove from continue reading"
                  onClick={() => removeMangaContinue(id)}
                  className="absolute right-1 top-1 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[5px] bg-canvas/80 text-faint transition [touch-action:manipulation] hover:text-fg"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ContinueReading;
