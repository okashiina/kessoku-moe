import type { NextApiRequest, NextApiResponse } from 'next';

import { and, eq } from 'drizzle-orm';

import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { clientIp, checkWriteRate } from '@utility/db/writeRate';

// Replace the owner's synced Watching set in one shot: delete every
// source:'watching' row and re-insert the supplied ids. Bells (source:'bell')
// are untouched. The cron only acts on these rows when the owner has
// autoWatching AND masterEnabled, so a sync here is harmless until opted in.

interface WatchingBody {
  deviceId?: string;
  anilistIds?: number[];
}

const MAX_IDS = 500;

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!hasDb()) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const body = (req.body || {}) as WatchingBody;
  const rawIds = Array.isArray(body.anilistIds) ? body.anilistIds : [];

  const viewer = await resolveViewer(req);
  const deviceId = String(body.deviceId || '').trim();
  const ownerKind = viewer ? 'user' : 'device';
  const ownerId = viewer ? String(viewer.id) : deviceId;
  if (!ownerId) {
    res.status(400).json({ error: 'no_owner' });
    return;
  }
  const ownerKey = `${ownerKind}:${ownerId}`;

  let gate = { ok: true } as ReturnType<typeof checkWriteRate>;
  try {
    gate = checkWriteRate(clientIp(req), ownerKey);
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

  // Clean the incoming set: positive ints only, deduped, capped.
  const ids = Array.from(
    new Set(
      rawIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
    )
  ).slice(0, MAX_IDS);

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }
  const { notifyTargets } = schema;

  // Wholesale replace: drop the old watching snapshot, insert the new one.
  await db
    .delete(notifyTargets)
    .where(
      and(
        eq(notifyTargets.ownerKind, ownerKind),
        eq(notifyTargets.ownerId, ownerId),
        eq(notifyTargets.source, 'watching')
      )
    );

  if (ids.length) {
    await db
      .insert(notifyTargets)
      .values(
        ids.map((anilistId) => ({
          ownerKind,
          ownerId,
          anilistId,
          source: 'watching',
        }))
      )
      .onConflictDoNothing({
        target: [
          notifyTargets.ownerKind,
          notifyTargets.ownerId,
          notifyTargets.anilistId,
          notifyTargets.source,
        ],
      });
  }

  res.status(200).json({ ok: true, count: ids.length });
};

export default handler;
