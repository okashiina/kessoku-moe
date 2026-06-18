import type { NextApiRequest, NextApiResponse } from 'next';

import { and, eq, sql } from 'drizzle-orm';

import { cacheGet, cacheSet } from '@utility/db/cache';
import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';

// Batch read of per-episode community ratings for one anime. Public: the
// aggregates (average + count per episode) are cached briefly and shared across
// callers. A signed-in viewer also gets back their OWN scores per episode so the
// rating dial can show what they picked; that slice is never cached (it's per
// user). avg is rounded to the 0-100 scale the dial stores.

interface Aggregate {
  avg: number;
  count: number;
}

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!hasDb()) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const rawId = Array.isArray(req.query.anilistId)
    ? req.query.anilistId[0]
    : req.query.anilistId;
  const anilistId = Math.trunc(Number(rawId));
  if (!Number.isFinite(anilistId) || anilistId <= 0) {
    res.status(400).json({ error: 'bad_anilist_id' });
    return;
  }

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const { episodeRatings } = schema;

  // Aggregates: shared + cacheable. Short TTL is owned by the cache module.
  const aggKey = `eprate:agg:${anilistId}`;
  let aggregates = cacheGet<Record<number, Aggregate>>(aggKey);
  if (!aggregates) {
    const rows = await db
      .select({
        episode: episodeRatings.episode,
        avg: sql<number>`avg(${episodeRatings.score})`,
        count: sql<number>`count(*)::int`,
      })
      .from(episodeRatings)
      .where(eq(episodeRatings.anilistId, anilistId))
      .groupBy(episodeRatings.episode);

    aggregates = rows.reduce<Record<number, Aggregate>>((acc, row) => {
      acc[row.episode] = {
        avg: Math.round(Number(row.avg)),
        count: Number(row.count),
      };
      return acc;
    }, {});
    cacheSet(aggKey, aggregates);
  }

  // Mine: per-viewer, never cached. No bearer / no viewer -> empty.
  const mine: Record<number, number> = {};
  const viewer = await resolveViewer(req);
  if (viewer) {
    const rows = await db
      .select({
        episode: episodeRatings.episode,
        score: episodeRatings.score,
      })
      .from(episodeRatings)
      .where(
        and(
          eq(episodeRatings.anilistId, anilistId),
          eq(episodeRatings.anilistUserId, viewer.id)
        )
      );
    rows.forEach((row) => {
      mine[row.episode] = Number(row.score);
    });
  }

  res.status(200).json({ aggregates, mine });
};

export default handler;
