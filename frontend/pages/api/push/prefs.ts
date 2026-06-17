import type { NextApiRequest, NextApiResponse } from 'next';

import { and, eq } from 'drizzle-orm';

import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { clientIp, checkWriteRate } from '@utility/db/writeRate';

// GET: the owner's notification prefs plus their explicit bell anime ids.
// PUT: update the master switch and/or the auto-from-Watching toggle.
// Reads are public; the owner is still server-resolved so a signed-in viewer and
// a signed-out device see their own state. Missing prefs row -> defaults.

interface PrefsPutBody {
  deviceId?: string;
  masterEnabled?: boolean;
  autoWatching?: boolean;
}

interface OwnerCtx {
  ownerKind: 'user' | 'device';
  ownerId: string;
  ownerKey: string;
}

// Resolve the owner from the request (viewer bearer first, then device id). Used
// by both verbs. Returns null when an anonymous caller gave no device id.
const resolveOwner = async (req: NextApiRequest): Promise<OwnerCtx | null> => {
  const viewer = await resolveViewer(req);
  const raw = req.method === 'GET' ? req.query.deviceId : req.body?.deviceId;
  const deviceId = String((raw as string | undefined) || '').trim();
  const ownerKind: 'user' | 'device' = viewer ? 'user' : 'device';
  const ownerId = viewer ? String(viewer.id) : deviceId;
  if (!ownerId) return null;
  return { ownerKind, ownerId, ownerKey: `${ownerKind}:${ownerId}` };
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!hasDb()) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const owner = await resolveOwner(req);
  if (!owner) {
    res.status(400).json({ error: 'no_owner' });
    return;
  }
  const { ownerKind, ownerId } = owner;

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }
  const { notifyPrefs, notifyTargets } = schema;

  if (req.method === 'GET') {
    const prefRows = await db
      .select()
      .from(notifyPrefs)
      .where(
        and(
          eq(notifyPrefs.ownerKind, ownerKind),
          eq(notifyPrefs.ownerId, ownerId)
        )
      );
    const pref = prefRows[0];

    const bellRows = await db
      .select({ anilistId: notifyTargets.anilistId })
      .from(notifyTargets)
      .where(
        and(
          eq(notifyTargets.ownerKind, ownerKind),
          eq(notifyTargets.ownerId, ownerId),
          eq(notifyTargets.source, 'bell')
        )
      );

    res.status(200).json({
      masterEnabled: pref ? pref.masterEnabled : true,
      autoWatching: pref ? pref.autoWatching : false,
      bells: bellRows.map((r) => r.anilistId),
    });
    return;
  }

  // PUT
  const body = (req.body || {}) as PrefsPutBody;
  const setMaster = typeof body.masterEnabled === 'boolean';
  const setAuto = typeof body.autoWatching === 'boolean';

  let gate = { ok: true } as ReturnType<typeof checkWriteRate>;
  try {
    gate = checkWriteRate(clientIp(req), owner.ownerKey);
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

  // Insert defaults, then override only the fields the caller actually sent so a
  // PUT of one toggle never resets the other.
  const insertValues: {
    ownerKind: string;
    ownerId: string;
    masterEnabled?: boolean;
    autoWatching?: boolean;
  } = { ownerKind, ownerId };
  const setValues: {
    updatedAt: Date;
    masterEnabled?: boolean;
    autoWatching?: boolean;
  } = { updatedAt: new Date() };
  if (setMaster) {
    insertValues.masterEnabled = body.masterEnabled;
    setValues.masterEnabled = body.masterEnabled;
  }
  if (setAuto) {
    insertValues.autoWatching = body.autoWatching;
    setValues.autoWatching = body.autoWatching;
  }

  const rows = await db
    .insert(notifyPrefs)
    .values(insertValues)
    .onConflictDoUpdate({
      target: [notifyPrefs.ownerKind, notifyPrefs.ownerId],
      set: setValues,
    })
    .returning({
      masterEnabled: notifyPrefs.masterEnabled,
      autoWatching: notifyPrefs.autoWatching,
    });

  const result = rows[0];
  res.status(200).json({
    masterEnabled: result ? result.masterEnabled : true,
    autoWatching: result ? result.autoWatching : false,
  });
};

export default handler;
