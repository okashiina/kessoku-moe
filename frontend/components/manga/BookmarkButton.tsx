import { useSyncExternalStore } from 'react';

import { BookmarkIcon as BookmarkOutline } from '@heroicons/react/outline';
import { BookmarkIcon as BookmarkSolid } from '@heroicons/react/solid';

import {
  isMangaSaved,
  subscribeMangaList,
  toggleMangaSaved,
} from '@utility/mangaList';

export interface MangaBookmarkButtonProps {
  id: number;
  title: string;
  cover: string | null;
  country: string | null;
}

const MangaBookmarkButton: React.FC<MangaBookmarkButtonProps> = ({
  id,
  title,
  cover,
  country,
}) => {
  const saved = useSyncExternalStore(
    subscribeMangaList,
    () => isMangaSaved(id),
    () => false
  );

  return (
    <button
      type="button"
      onClick={() => toggleMangaSaved({ id, title, cover, country })}
      aria-pressed={saved}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
        saved
          ? 'bg-accent/15 border-accent text-accent'
          : 'border-line/70 bg-surface/60 text-fg hover:border-accent/60'
      }`}
    >
      {saved ? (
        <BookmarkSolid className="h-5 w-5" />
      ) : (
        <BookmarkOutline className="h-5 w-5" />
      )}
      {saved ? 'In My List' : 'Add to My List'}
    </button>
  );
};

export default MangaBookmarkButton;
