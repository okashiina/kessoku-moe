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
      <div className="mb-3 flex items-center gap-2.5 px-4 sm:px-6 lg:px-8">
        <span className="h-5 w-1 shrink-0 rounded-full bg-aurora" aria-hidden />
        <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
          Continue reading
        </h2>
      </div>

      <div className="edge-fade-x">
        <div className="flex snap-x gap-4 overflow-x-auto px-4 pb-3 scrollbar-hide sm:px-6 lg:px-8">
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
                className="relative w-60 shrink-0 snap-start overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line/40"
              >
                <Link href={href} passHref>
                  <a className="flex gap-3 p-3">
                    <div className="relative h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-canvas-2">
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
                      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-line/50">
                        <div
                          className="h-full rounded-full bg-aurora"
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
                  className="absolute right-1 top-1 rounded-full bg-canvas/70 p-2 text-faint backdrop-blur-sm transition [touch-action:manipulation] hover:text-fg"
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
