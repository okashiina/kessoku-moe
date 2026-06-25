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

// "Because you read <Title>" rails. Unlike "For you" (which blends all of the
// reader's seeds into one rail), this surfaces the SOURCE: it takes the 1-2
// most-recent titles from history (recently-read first, then saved) and shows a
// rail per seed of AniList's "fans of X also liked…". Each rail names its seed,
// so the recommendation is legible ("you read Berserk → here's more"). Renders
// nothing when there's no history or no recommendations come back.

interface BecauseYouReadProps {
  nsfw: boolean;
}

interface Seed {
  id: number;
  title: string;
}

interface SeedRailProps {
  seed: Seed;
  nsfw: boolean;
}

const MAX_RAILS = 2;

// One rail for a single seed. Self-fetches its recommendations and hides itself
// until they arrive, so an empty seed never leaves a titled-but-empty shell.
const SeedRail: React.FC<SeedRailProps> = ({ seed, nsfw }) => {
  const [media, setMedia] = useState<MangaInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch('/api/manga/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seedIds: [seed.id], nsfw }),
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
  }, [seed.id, nsfw]);

  if (!media.length) return null;

  return (
    <MangaSection title={`Because you read ${seed.title}`} mangaList={media} />
  );
};

const BecauseYouRead: React.FC<BecauseYouReadProps> = ({ nsfw }) => {
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

  // Recently-read seeds first (with their cached title), then saved, deduped by
  // id — keep only the 1-2 most recent that actually carry a title to name.
  const fromReading: Seed[] = reading.map((r) => ({
    id: r.id,
    title: r.entry.title,
  }));
  const fromSaved: Seed[] = saved.map((s) => ({ id: s.id, title: s.title }));

  const seen = new Set<number>();
  const seeds: Seed[] = [...fromReading, ...fromSaved]
    .filter((s) => {
      if (!s.title || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    })
    .slice(0, MAX_RAILS);

  if (!seeds.length) return null;

  return (
    <>
      {seeds.map((seed) => (
        <SeedRail key={seed.id} seed={seed} nsfw={nsfw} />
      ))}
    </>
  );
};

export default BecauseYouRead;
