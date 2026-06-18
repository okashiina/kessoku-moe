import { ANILIST_ENDPOINT, requestWithRetry } from './anilist';

// AniList per-title recommendations ("fans of X also liked...") for several seed
// titles in ONE batched request: an aliased Page.recommendations node per seed,
// so the home recommendation rails cost a single round-trip. We pull only ids +
// rating here; the full card media is resolved (and cached/deduped/rate-limited)
// via getAllAnimeByIds. Mirrors the recommendations query in pages.gql.

export interface RawRec {
  id: number;
  rating: number; // AniList net up/down votes for the recommendation
}

interface RecPage {
  recommendations: {
    rating: number | null;
    mediaRecommendation: { id: number } | null;
  }[];
}

const PER_SEED = 16;

/**
 * For each seed AniList id, its top recommendations (community RATING_DESC).
 * Returns seedId -> [{ id, rating }] in that order. One network request total,
 * rate-limit-safe via requestWithRetry. Empty map for no/invalid seeds.
 */
export const fetchRecommendationsForSeeds = async (
  seedIds: number[]
): Promise<Map<number, RawRec[]>> => {
  const out = new Map<number, RawRec[]>();
  const ids = Array.from(new Set(seedIds.map((n) => Number(n)))).filter(
    (n) => Number.isInteger(n) && n > 0
  );
  if (ids.length === 0) return out;

  // One query, one aliased Page.recommendations per seed. ids are integers we
  // coerced + validated above, so inlining them is injection-safe.
  const body = ids
    .map(
      (id, i) =>
        `s${i}: Page(perPage: ${PER_SEED}) { recommendations(mediaId: ${id}, sort: RATING_DESC) { rating mediaRecommendation { id } } }`
    )
    .join('\n');
  const query = `query HomeRecs {\n${body}\n}`;

  const data = await requestWithRetry<Record<string, RecPage | null>>(
    ANILIST_ENDPOINT,
    query
  );

  ids.forEach((id, i) => {
    const recs = (data[`s${i}`]?.recommendations ?? [])
      .map((r) => ({
        id: r.mediaRecommendation?.id ?? 0,
        rating: r.rating ?? 0,
      }))
      .filter((r) => r.id > 0);
    out.set(id, recs);
  });

  return out;
};
