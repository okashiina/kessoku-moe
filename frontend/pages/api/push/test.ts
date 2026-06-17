import type { NextApiRequest, NextApiResponse } from 'next';

import { and, eq, inArray } from 'drizzle-orm';

import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { clientIp, checkWriteRate } from '@utility/db/writeRate';
import { pushConfigured, sendToSubscriptions } from '@utility/push/server';

// Send a test push to every one of the owner's subscriptions. Proves the whole
// pipeline end to end (VAPID config, the browser's service worker, the OS) so a
// user can confirm "push is on" before they wait for a real episode. Tightly
// rate-limited because it actually delivers a notification.

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
  if (!pushConfigured()) {
    res.status(503).json({ error: 'push_unconfigured' });
    return;
  }

  const viewer = await resolveViewer(req);
  const deviceId = String(
    (req.body?.deviceId ?? req.query.deviceId) || ''
  ).trim();
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
  const { pushSubscriptions } = schema;

  const subs = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.ownerKind, ownerKind),
        eq(pushSubscriptions.ownerId, ownerId)
      )
    );

  const { sent, prunedIds } = await sendToSubscriptions(subs, {
    title: 'kessoku moe',
    body: 'Push is on. We will ping you when a new episode drops.',
    url: '/settings',
    tag: 'kessoku-test',
  });

  // Clean up any endpoints the push service reported as gone.
  if (prunedIds.length) {
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.id, prunedIds));
  }

  res.status(200).json({ sent });
};

export default handler;
