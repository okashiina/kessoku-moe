import type { NextApiRequest, NextApiResponse } from 'next';

import { and, eq } from 'drizzle-orm';

import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { clientIp, checkWriteRate } from '@utility/db/writeRate';

// Toggle an explicit per-anime bell for the owner. `source:'bell'` keeps these
// hand-picked alerts separate from synced Watching-list entries, so re-syncing
// the Watching snapshot never disturbs a bell. on -> upsert (no-op if present),
// off -> delete the row.

interface BellBody {
  deviceId?: string;
  anilistId?: number;
  on?: boolean;
}

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

  const body = (req.body || {}) as BellBody;
  const anilistId = Number(body.anilistId);
  if (!Number.isInteger(anilistId) || anilistId <= 0) {
    res.status(400).json({ error: 'invalid_anilist_id' });
    return;
  }
  const on = body.on === true;

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

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }
  const { notifyTargets } = schema;

  if (on) {
    await db
      .insert(notifyTargets)
      .values({ ownerKind, ownerId, anilistId, source: 'bell' })
      .onConflictDoNothing({
        target: [
          notifyTargets.ownerKind,
          notifyTargets.ownerId,
          notifyTargets.anilistId,
          notifyTargets.source,
        ],
      });
  } else {
    await db
      .delete(notifyTargets)
      .where(
        and(
          eq(notifyTargets.ownerKind, ownerKind),
          eq(notifyTargets.ownerId, ownerId),
          eq(notifyTargets.anilistId, anilistId),
          eq(notifyTargets.source, 'bell')
        )
      );
  }

  res.status(200).json({ ok: true, on });
};

export default handler;
