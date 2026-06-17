import type { NextApiRequest, NextApiResponse } from 'next';

import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { clientIp, checkWriteRate } from '@utility/db/writeRate';

// Register (or refresh) a browser's Web Push subscription. One row per endpoint
// (the natural unique key) so a re-subscribe from the same browser updates in
// place. The owner is server-resolved: a signed-in AniList viewer owns it by
// user id, otherwise an anonymous device id does. Also makes sure a prefs row
// exists so the first send finds defaults instead of nothing.

interface SubscribeBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  deviceId?: string;
  userAgent?: string;
}

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

  const body = (req.body || {}) as SubscribeBody;
  const endpoint = String(body.endpoint || '').trim();
  const p256dh = String(body.keys?.p256dh || '').trim();
  const auth = String(body.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: 'invalid_subscription' });
    return;
  }

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

  const userAgent = String(body.userAgent || '').trim() || null;
  const anilistUserId = viewer ? viewer.id : null;
  const { pushSubscriptions, notifyPrefs } = schema;

  await db
    .insert(pushSubscriptions)
    .values({
      endpoint,
      p256dh,
      auth,
      ownerKind,
      ownerId,
      anilistUserId,
      deviceId,
      userAgent,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        p256dh,
        auth,
        ownerKind,
        ownerId,
        anilistUserId,
        deviceId,
        userAgent,
        lastSeenAt: new Date(),
      },
    });

  // Make sure the owner has a prefs row so the cron's default-on logic and the
  // settings UI have something to read. Defaults only; never clobber existing.
  await db
    .insert(notifyPrefs)
    .values({ ownerKind, ownerId })
    .onConflictDoNothing({
      target: [notifyPrefs.ownerKind, notifyPrefs.ownerId],
    });

  res.status(200).json({ ok: true });
};

export default handler;
