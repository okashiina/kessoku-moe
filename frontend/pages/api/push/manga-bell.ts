import type { NextApiRequest, NextApiResponse } from 'next';

import { and, eq } from 'drizzle-orm';

import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { clientIp, checkWriteRate } from '@utility/db/writeRate';

// Per-manga "ping me when a new chapter drops" bell. Mirrors the anime
// pages/api/push/bell.ts exactly (server-resolved owner, same write-rate gate)
// but writes manga_notify_targets. PUT toggles a row; GET reports whether the
// owner already has a bell on for a given manga (used by NotifyBell's initial
// render). on=true upserts with last_chapter left null, so the owner only gets
// FUTURE chapters — never a backfill blast of the whole catalogue.

interface MangaBellBody {
  deviceId?: string;
  anilistId?: number;
  title?: string;
  on?: boolean;
}

interface OwnerCtx {
  ownerKind: 'user' | 'device';
  ownerId: string;
  ownerKey: string;
}

// Resolve the owner from the request (viewer bearer first, then device id),
// identical to bell.ts / prefs.ts. Never trusts a client-claimed identity.
const resolveOwner = async (req: NextApiRequest): Promise<OwnerCtx | null> => {
  const viewer = await resolveViewer(req);
  const raw = req.method === 'GET' ? req.query.deviceId : req.body?.deviceId;
  const deviceId = String((raw as string | undefined) || '').trim();
  const ownerKind: 'user' | 'device' = viewer ? 'user' : 'device';
  const ownerId = viewer ? String(viewer.id) : deviceId;
  if (!ownerId) return null;
  return { ownerKind, ownerId, ownerKey: `${ownerKind}:${ownerId}` };
};

const parseAnilistId = (raw: unknown): number => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'PUT' && req.method !== 'GET') {
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
  const { mangaNotifyTargets } = schema;

  // GET: is the bell on for this manga? (Reads are public; owner still resolved
  // so a viewer and a device see their own state.)
  if (req.method === 'GET') {
    const anilistId = parseAnilistId(req.query.anilistId);
    if (!anilistId) {
      res.status(400).json({ error: 'invalid_anilist_id' });
      return;
    }
    const rows = await db
      .select({ id: mangaNotifyTargets.id })
      .from(mangaNotifyTargets)
      .where(
        and(
          eq(mangaNotifyTargets.ownerKind, ownerKind),
          eq(mangaNotifyTargets.ownerId, ownerId),
          eq(mangaNotifyTargets.anilistId, anilistId)
        )
      )
      .limit(1);
    res.status(200).json({ on: rows.length > 0 });
    return;
  }

  // PUT
  const body = (req.body || {}) as MangaBellBody;
  const anilistId = parseAnilistId(body.anilistId);
  if (!anilistId) {
    res.status(400).json({ error: 'invalid_anilist_id' });
    return;
  }
  const on = body.on === true;
  const title = String(body.title || '')
    .slice(0, 300)
    .trim();

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

  if (on) {
    // last_chapter intentionally left null on insert: future chapters only.
    await db
      .insert(mangaNotifyTargets)
      .values({ ownerKind, ownerId, anilistId, title: title || null })
      .onConflictDoNothing({
        target: [
          mangaNotifyTargets.ownerKind,
          mangaNotifyTargets.ownerId,
          mangaNotifyTargets.anilistId,
        ],
      });
  } else {
    await db
      .delete(mangaNotifyTargets)
      .where(
        and(
          eq(mangaNotifyTargets.ownerKind, ownerKind),
          eq(mangaNotifyTargets.ownerId, ownerId),
          eq(mangaNotifyTargets.anilistId, anilistId)
        )
      );
  }

  res.status(200).json({ ok: true, on });
};

export default handler;
