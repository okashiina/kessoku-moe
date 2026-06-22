import type { NextApiRequest, NextApiResponse } from 'next';

import { ANILIST_ENDPOINT, requestWithRetry } from '@utility/anilist';
import type { MangaInfo } from '@utility/manga';
import { fetchRecommendationsForSeeds } from '@utility/recommendations';

// "For you" rail: take the reader's recent-read seed ids (sent from the client),
// ask AniList "fans of X also liked…" for each, rank the recommended titles by
// community rating, then resolve the top ones to full MangaInfo. No AI here —
// AniList is free/keyless — so no aiGuard. Any failure → { media: [] } and the
// rail simply hides.

const MAX_SEEDS = 5;
const MAX_RESULTS = 24;

// Same fields MangaInfo needs, inline here so we don't touch utility/manga.ts.
const MEDIA_FIELDS = `
  id
  title { romaji english native }
  coverImage { large medium color }
  format
  status
  chapters
  volumes
  countryOfOrigin
  meanScore
  genres
  isAdult
`;

interface RawMediaByIds {
  Page: {
    media: (MangaInfo & { isAdult: boolean | null })[];
  } | null;
}

// Fetch full MangaInfo for a set of ids (ids are validated integers, inlined
// like recommendations.ts does — injection-safe).
const fetchMangaByIds = async (ids: number[]): Promise<RawMediaByIds> => {
  const query = `
    query MangaByIds($ids: [Int]) {
      Page(perPage: ${ids.length}) {
        media(id_in: $ids, type: MANGA) { ${MEDIA_FIELDS} }
      }
    }
  `;
  return requestWithRetry<RawMediaByIds>(ANILIST_ENDPOINT, query, { ids });
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const body = (req.body || {}) as { seedIds?: unknown; nsfw?: boolean };
  const nsfw = body.nsfw === true;

  // Cap + dedupe + validate the seed ids.
  const seedIds = Array.from(
    new Set(
      (Array.isArray(body.seedIds) ? body.seedIds : [])
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0)
    )
  ).slice(0, MAX_SEEDS);

  if (!seedIds.length) {
    res.status(200).json({ media: [] });
    return;
  }

  try {
    const bySeed = await fetchRecommendationsForSeeds(seedIds);

    // Merge all recs, keep best rating per id, drop ids already in seeds.
    const seedSet = new Set(seedIds);
    const ratingById = new Map<number, number>();
    bySeed.forEach((recs) => {
      recs.forEach((rec) => {
        if (seedSet.has(rec.id)) return;
        const prev = ratingById.get(rec.id) ?? -Infinity;
        if (rec.rating > prev) ratingById.set(rec.id, rec.rating);
      });
    });

    const rankedIds = Array.from(ratingById.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .slice(0, MAX_RESULTS);

    if (!rankedIds.length) {
      res.status(200).json({ media: [] });
      return;
    }

    const data = await fetchMangaByIds(rankedIds);
    const raw = data.Page?.media ?? [];

    // Filter adult when SFW, then restore the rating-ranked order (AniList
    // returns id_in results in its own order).
    const order = new Map(rankedIds.map((id, i) => [id, i]));
    const media: MangaInfo[] = raw
      .filter((m) => (nsfw ? true : !m.isAdult))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((m) => ({
        id: m.id,
        title: m.title,
        coverImage: m.coverImage,
        format: m.format,
        status: m.status,
        chapters: m.chapters,
        volumes: m.volumes,
        countryOfOrigin: m.countryOfOrigin,
        meanScore: m.meanScore,
        genres: m.genres,
      }));

    res.status(200).json({ media });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[manga-recommendations] failed', error);
    res.status(200).json({ media: [] });
  }
};

export default handler;
