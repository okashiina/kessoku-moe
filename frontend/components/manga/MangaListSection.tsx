import { useSyncExternalStore } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import {
  listSavedManga,
  MANGA_LIST_EMPTY,
  subscribeMangaList,
  type MangaStatus,
} from '@utility/mangaList';
import {
  listMangaContinue,
  MANGA_CONTINUE_EMPTY,
  subscribeMangaProgress,
} from '@utility/mangaProgress';

interface Tile {
  id: number;
  title: string;
  cover: string | null;
  chapter: number | null;
  status?: MangaStatus;
}

// Short badge label for a local reading status on a tile.
const STATUS_BADGE: Record<MangaStatus, string> = {
  READING: 'Reading',
  COMPLETED: 'Done',
  PLAN_TO_READ: 'Plan',
};

// "Manga" block on the My List page: bookmarked series (mangaList) unioned with
// whatever you're mid-read on (mangaProgress), most-recent first.
const MangaListSection: React.FC = () => {
  const saved = useSyncExternalStore(
    subscribeMangaList,
    listSavedManga,
    () => MANGA_LIST_EMPTY
  );
  const reading = useSyncExternalStore(
    subscribeMangaProgress,
    listMangaContinue,
    () => MANGA_CONTINUE_EMPTY
  );

  const byId = new Map<number, Tile>();
  saved.forEach((s) =>
    byId.set(s.id, {
      id: s.id,
      title: s.title,
      cover: s.cover,
      chapter: null,
      status: s.status,
    })
  );
  reading.forEach(({ id, entry }) => {
    const prev = byId.get(id);
    byId.set(id, {
      id,
      title: entry.title || prev?.title || 'Untitled',
      cover: entry.cover ?? prev?.cover ?? null,
      chapter: entry.ch,
      status: prev?.status,
    });
  });
  const tiles = Array.from(byId.values());

  if (!tiles.length) {
    return (
      <div className="flex min-h-[340px] flex-col items-center justify-center gap-4 px-6 py-20 text-center">
        <h2 className="font-display text-[26px] font-extrabold text-fg">
          No manga yet
        </h2>
        <p className="max-w-[420px] text-sm leading-[1.7] text-[#bfb2c1]">
          Tap &ldquo;Add to My List&rdquo; on any manga, or start reading one,
          and it shows up here.
        </p>
      </div>
    );
  }

  return (
    <section>
      <div className="grid grid-cols-2 gap-[22px] md:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.id} href={`/manga/${t.id}`} passHref>
            <a className="group block w-full">
              <div
                style={{ aspectRatio: '2 / 3' }}
                className="relative w-full overflow-hidden rounded-2xl bg-surface shadow-card ring-1 ring-line/40 transition group-hover:-translate-y-1 group-hover:shadow-lift group-hover:ring-2 group-hover:ring-accent/50"
              >
                {t.cover && (
                  <Image
                    alt={t.title}
                    src={t.cover}
                    layout="fill"
                    objectFit="cover"
                  />
                )}
                {t.status && (
                  <span className="absolute left-2 top-2 rounded-[5px] bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">
                    {STATUS_BADGE[t.status]}
                  </span>
                )}
                {t.chapter != null && (
                  <span className="absolute bottom-2 left-2 rounded-[5px] bg-canvas/75 px-2 py-0.5 text-[11px] font-bold text-fg backdrop-blur-sm">
                    Ch. {t.chapter}
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm font-semibold text-fg transition line-clamp-2 group-hover:text-accent">
                {t.title}
              </p>
            </a>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default MangaListSection;
