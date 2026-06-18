import type { NextApiRequest, NextApiResponse } from 'next';

import { and, eq, sql } from 'drizzle-orm';

import { cacheDel } from '@utility/db/cache';
import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { checkWriteRate, clientIp } from '@utility/db/writeRate';

// Write (PUT) or clear (DELETE) the signed-in viewer's own rating for one
// episode. Rating requires an AniList login so each average reflects real
// accounts (one row per user per episode); identity is server-resolved from the
// bearer, never trusted from the body. After a write we drop the anime's cached
// aggregate and recompute just the one touched episode so the caller can update
// its dial without a refetch. Rate limited per Rule 8 (fail open if the limiter
// itself throws).

interface RatingBody {
  anilistId?: unknown;
  episode?: unknown;
  score?: unknown;
}

interface Aggregate {
  avg: number;
  count: number;
}

const posInt = (v: unknown): number | null => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'PUT' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'PUT, DELETE');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!hasDb()) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const viewer = await resolveViewer(req);
  if (!viewer) {
    res.status(401).json({ error: 'login_required' });
    return;
  }

  let gate = { ok: true } as ReturnType<typeof checkWriteRate>;
  try {
    gate = checkWriteRate(clientIp(req), `user:${viewer.id}`);
  } catch {
    gate = { ok: true };
  }
  if (!gate.ok) {
    if (gate.retryAfter) res.setHeader('Retry-After', String(gate.retryAfter));
    res.status(429).json({
      error: 'rate_limited',
      reason: gate.reason,
      retryAfter: gate.retryAfter,
    });
    return;
  }

  const body = (req.body || {}) as RatingBody;
  const anilistId = posInt(body.anilistId);
  const episode = posInt(body.episode);
  if (anilistId === null || episode === null) {
    res.status(400).json({ error: 'bad_input' });
    return;
  }

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const { episodeRatings } = schema;

  if (req.method === 'PUT') {
    const score = Math.round(Number(body.score));
    if (!Number.isFinite(score) || score < 1 || score > 100) {
      res.status(400).json({ error: 'bad_score' });
      return;
    }
    await db
      .insert(episodeRatings)
      .values({
        anilistId,
        episode,
        anilistUserId: viewer.id,
        score,
      })
      .onConflictDoUpdate({
        target: [
          episodeRatings.anilistId,
          episodeRatings.episode,
          episodeRatings.anilistUserId,
        ],
        set: { score, updatedAt: new Date() },
      });
  } else {
    await db
      .delete(episodeRatings)
      .where(
        and(
          eq(episodeRatings.anilistId, anilistId),
          eq(episodeRatings.episode, episode),
          eq(episodeRatings.anilistUserId, viewer.id)
        )
      );
  }

  // The batch aggregate is stale now; drop it so the next read recomputes.
  cacheDel(`eprate:agg:${anilistId}`);

  // Recompute just the touched episode so the caller can update in place.
  const rows = await db
    .select({
      avg: sql<number>`avg(${episodeRatings.score})`,
      count: sql<number>`count(*)::int`,
    })
    .from(episodeRatings)
    .where(
      and(
        eq(episodeRatings.anilistId, anilistId),
        eq(episodeRatings.episode, episode)
      )
    );

  const row = rows[0];
  const count = row ? Number(row.count) : 0;
  const aggregate: Aggregate | null =
    count > 0 ? { avg: Math.round(Number(row.avg)), count } : null;

  res.status(200).json({ aggregate });
};

export default handler;
