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
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-[5px] border px-4 text-sm font-bold transition [touch-action:manipulation] active:scale-95 ${
        saved
          ? 'bg-accent/15 border-accent text-accent'
          : 'border-[#66516a] bg-surface/70 text-fg hover:text-accent'
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
