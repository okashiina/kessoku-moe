import { useSyncExternalStore } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import {
  listSavedManga,
  MANGA_LIST_EMPTY,
  subscribeMangaList,
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
}

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
    byId.set(s.id, { id: s.id, title: s.title, cover: s.cover, chapter: null })
  );
  reading.forEach(({ id, entry }) => {
    const prev = byId.get(id);
    byId.set(id, {
      id,
      title: entry.title || prev?.title || 'Untitled',
      cover: entry.cover ?? prev?.cover ?? null,
      chapter: entry.ch,
    });
  });
  const tiles = Array.from(byId.values());

  if (!tiles.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-line/50 bg-surface/30 px-6 py-20 text-center">
        <p className="font-display text-lg font-bold text-fg">No manga yet</p>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Tap &ldquo;Add to My List&rdquo; on any manga, or start reading one,
          and it shows up here.
        </p>
      </div>
    );
  }

  return (
    <section>
      <div className="grid grid-cols-3 justify-items-center gap-4 sm:grid-cols-4 lg:grid-cols-6">
        {tiles.map((t) => (
          <Link key={t.id} href={`/manga/${t.id}`} passHref>
            <a className="group block w-full max-w-[11rem]">
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
                {t.chapter != null && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-canvas/75 px-2 py-0.5 text-[11px] font-semibold text-fg backdrop-blur-sm">
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
