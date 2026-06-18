import type { NextApiRequest, NextApiResponse } from 'next';

import { eq, sql } from 'drizzle-orm';

import { cacheDel } from '@utility/db/cache';
import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { checkWriteRate, clientIp } from '@utility/db/writeRate';

// Report a comment. One report per user per comment (the unique index drops
// duplicates); only a genuinely new report bumps the mirrored report_count that
// drives auto-hide. Identity is server-resolved from the bearer, never trusted
// from the body. Rate limited per Rule 8 (fail open if the limiter itself
// throws).

const posInt = (v: unknown): number | null => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

type Row = typeof schema.comments.$inferSelect;

const firstPageKey = (row: Row): string =>
  `comments:${row.targetType}:${row.anilistId}:${row.episode || 0}:p1`;

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
    res.status(429).json({
      error: 'rate_limited',
      reason: gate.reason,
      retryAfter: gate.retryAfter,
    });
    return;
  }

  const id = posInt(req.query.id);
  if (id === null) {
    res.status(400).json({ error: 'bad_input' });
    return;
  }

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const { comments, commentReports } = schema;

  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  const row = rows[0];
  if (!row || row.deletedAt !== null) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  // The unique (comment_id, anilist_user_id) index makes a repeat report a
  // no-op; .returning() tells us whether THIS call actually inserted a row.
  const insertedReports = await db
    .insert(commentReports)
    .values({ commentId: id, anilistUserId: viewer.id })
    .onConflictDoNothing()
    .returning();

  let { reportCount } = row;
  if (insertedReports.length > 0) {
    const bumped = await db
      .update(comments)
      .set({ reportCount: sql`${comments.reportCount} + 1` })
      .where(eq(comments.id, id))
      .returning();
    if (bumped[0]) reportCount = bumped[0].reportCount;
  }

  cacheDel(firstPageKey(row));
  res.status(200).json({ ok: true, reportCount });
};

export default handler;
