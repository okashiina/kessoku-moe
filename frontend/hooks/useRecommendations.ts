import { useEffect, useState } from 'react';

import { AnimeInfoFragment } from '@animeflix/api/aniList';

import useWatchHistory from '@hooks/useWatchHistory';
import useWatchlist from '@hooks/useWatchlist';
import { getAllAnimeByIds } from '@utility/animeByIds';
import { listProgressIds } from '@utility/progress';
import { fetchRecommendationsForSeeds } from '@utility/recommendations';
import { AniTitle } from '@utility/titleLang';

// Personalized home recommendations, computed client-side from local taste
// signals (recent watches first, then saved titles) against AniList's per-title
// recommendations. Two outputs from ONE fetch: an aggregate "Recommended for
// you" (titles many seeds point to, ranked by overlap then rating) and a single
// "Because you watched X" (the most-recent seed's recs). Anything already
// watched/in-progress or saved is excluded, so only NEW titles surface. Returns
// empty (rails hide) for a fresh/anonymous visitor.

const MAX_SEEDS = 5;
const RAIL_SIZE = 24;
const BECAUSE_MIN = 4; // don't make a "because" rail from a near-empty result

export interface BecauseRail {
  seedId: number;
  title: AniTitle;
  items: AnimeInfoFragment[];
}

export interface Recommendations {
  forYou: AnimeInfoFragment[];
  because: BecauseRail | null;
  loading: boolean;
}

const EMPTY: Recommendations = { forYou: [], because: null, loading: false };

const useRecommendations = (): Recommendations => {
  const history = useWatchHistory();
  const watchlist = useWatchlist();
  const [data, setData] = useState<Recommendations>(EMPTY);

  // Seeds: most-recent watches first, then saved titles, deduped + capped.
  const seedKey = Array.from(
    new Set([...history.map((h) => h.id), ...watchlist])
  )
    .slice(0, MAX_SEEDS)
    .join(',');
  // Exclusion key: every title the viewer already touched (any progress) plus
  // their watchlist. Kept as its own dep so adding a saved title re-filters even
  // when the seed set is unchanged.
  const excludeKey = Array.from(
    new Set([...listProgressIds(), ...watchlist])
  ).join(',');

  useEffect(() => {
    const seeds = seedKey.split(',').filter(Boolean).map(Number);
    if (seeds.length === 0) {
      setData(EMPTY);
      return undefined;
    }

    let cancelled = false;
    setData((prev) => ({ ...prev, loading: true }));

    const excluded = new Set<number>(
      excludeKey.split(',').filter(Boolean).map(Number)
    );

    fetchRecommendationsForSeeds(seeds)
      .then(async (bySeed) => {
        if (cancelled) return;

        // Aggregate: a title recommended by more of your seeds (then with higher
        // community rating) ranks higher.
        const tally = new Map<number, { count: number; score: number }>();
        seeds.forEach((seed) => {
          (bySeed.get(seed) ?? []).forEach(({ id, rating }) => {
            if (excluded.has(id)) return;
            const cur = tally.get(id) ?? { count: 0, score: 0 };
            cur.count += 1;
            cur.score += Math.max(0, rating);
            tally.set(id, cur);
          });
        });
        const forYouIds = Array.from(tally.entries())
          .sort((a, b) => b[1].count - a[1].count || b[1].score - a[1].score)
          .map(([id]) => id)
          .slice(0, RAIL_SIZE);

        // "Because you watched": the most-recent seed with enough fresh recs.
        let becauseSeed = 0;
        let becauseIds: number[] = [];
        for (let i = 0; i < seeds.length; i += 1) {
          const fresh = (bySeed.get(seeds[i]) ?? [])
            .map((r) => r.id)
            .filter((id) => !excluded.has(id));
          if (fresh.length >= BECAUSE_MIN) {
            becauseSeed = seeds[i];
            becauseIds = fresh.slice(0, RAIL_SIZE);
            break;
          }
        }

        const union = Array.from(
          new Set([
            ...forYouIds,
            ...becauseIds,
            ...(becauseSeed ? [becauseSeed] : []),
          ])
        );
        const media = await getAllAnimeByIds(union);
        if (cancelled) return;
        const byId = new Map(media.map((m) => [m.id, m]));

        const present = (id: number): AnimeInfoFragment | undefined =>
          byId.get(id);
        const forYou = forYouIds
          .map(present)
          .filter((m): m is AnimeInfoFragment => Boolean(m));
        const becauseItems = becauseIds
          .map(present)
          .filter((m): m is AnimeInfoFragment => Boolean(m));
        const seedMedia = becauseSeed ? byId.get(becauseSeed) : undefined;
        const because: BecauseRail | null =
          becauseSeed && seedMedia && becauseItems.length
            ? {
                seedId: becauseSeed,
                title: seedMedia.title,
                items: becauseItems,
              }
            : null;

        setData({ forYou, because, loading: false });
      })
      .catch(() => {
        if (!cancelled) setData(EMPTY);
      });

    return () => {
      cancelled = true;
    };
  }, [seedKey, excludeKey]);

  return data;
};

export default useRecommendations;
