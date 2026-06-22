import { useEffect, useState, useSyncExternalStore } from 'react';

import MangaSection from '@components/manga/Section';
import type { MangaInfo } from '@utility/manga';
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

// "For you" rail: seeds come from the reader's own history — recently-read
// (mangaProgress) unioned with saved (mangaList), most-recent first, top ~5 ids.
// We POST those to /api/manga/recommendations (AniList "fans also liked"). The
// rail renders only when there are seeds AND the API returns results; otherwise
// it's invisible, so a first-time / no-history visitor never sees an empty shell.

interface ForYouRailProps {
  nsfw: boolean;
}

const MAX_SEEDS = 5;

const ForYouRail: React.FC<ForYouRailProps> = ({ nsfw }) => {
  const reading = useSyncExternalStore(
    subscribeMangaProgress,
    listMangaContinue,
    () => MANGA_CONTINUE_EMPTY
  );
  const saved = useSyncExternalStore(
    subscribeMangaList,
    listSavedManga,
    () => MANGA_LIST_EMPTY
  );

  // Recent-read ids first, then saved, deduped — most-recent intent wins.
  const seedIds = Array.from(
    new Set([...reading.map((r) => r.id), ...saved.map((s) => s.id)])
  ).slice(0, MAX_SEEDS);
  const seedKey = seedIds.join(',');

  const [media, setMedia] = useState<MangaInfo[]>([]);

  useEffect(() => {
    if (!seedIds.length) {
      setMedia([]);
      return undefined;
    }
    let cancelled = false;
    const controller = new AbortController();
    fetch('/api/manga/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seedIds, nsfw }),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : { media: [] }))
      .then((data: { media?: MangaInfo[] }) => {
        if (!cancelled) setMedia(Array.isArray(data.media) ? data.media : []);
      })
      .catch(() => {
        if (!cancelled) setMedia([]);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
    // ponytail: seedKey/nsfw drive the refetch; seedIds is derived from seedKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, nsfw]);

  if (!seedIds.length || !media.length) return null;

  return <MangaSection title="For you" mangaList={media} />;
};

export default ForYouRail;
