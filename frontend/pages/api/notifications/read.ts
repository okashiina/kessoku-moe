import type { NextApiRequest, NextApiResponse } from 'next';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { checkWriteRate, clientIp } from '@utility/db/writeRate';

// Mark the viewer's notifications read: a list of ids, or all of them when no
// ids are given. Scoped to the server-resolved viewer, so a user can only ever
// mark their OWN notifications. Returns the remaining unread count.

const posInt = (v: unknown): number | null => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
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
    res
      .status(429)
      .json({ error: 'rate_limited', retryAfter: gate.retryAfter });
    return;
  }

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const { notifications } = schema;

  // Optional id whitelist; anything not a positive int is dropped.
  const rawIds = (req.body as { ids?: unknown })?.ids;
  const ids = Array.isArray(rawIds)
    ? rawIds.map(posInt).filter((n): n is number => n !== null)
    : null;

  const mine = eq(notifications.recipientAnilistUserId, viewer.id);
  const target =
    ids && ids.length > 0
      ? and(mine, inArray(notifications.id, ids), isNull(notifications.readAt))
      : and(mine, isNull(notifications.readAt));

  // An empty (but present) ids array means "nothing to mark" — skip the write.
  if (!ids || ids.length > 0) {
    await db.update(notifications).set({ readAt: new Date() }).where(target);
  }

  const unreadRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(mine, isNull(notifications.readAt)));

  res.status(200).json({
    ok: true,
    unread: unreadRows[0] ? Number(unreadRows[0].n) : 0,
  });
};

export default handler;
