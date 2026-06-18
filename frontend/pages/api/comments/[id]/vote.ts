import type { NextApiRequest, NextApiResponse } from 'next';

import { and, eq, sql } from 'drizzle-orm';

import { cacheDel } from '@utility/db/cache';
import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { checkWriteRate, clientIp } from '@utility/db/writeRate';

// Upvote (POST) or remove an upvote (DELETE) on a comment. One vote per user
// per comment (the unique index keeps it idempotent); the mirrored vote_count
// only moves on a real add/remove, so it can't be inflated by repeat calls.
// Identity is server-resolved from the bearer, never trusted from the body.
// Rate limited per Rule 8 (fail open if the limiter itself throws).

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
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST, DELETE');
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

  const { comments, commentVotes } = schema;

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

  let { voteCount } = row;

  if (req.method === 'POST') {
    // The unique (comment_id, anilist_user_id) index makes a repeat vote a
    // no-op; .returning() tells us whether THIS call actually added a vote.
    const added = await db
      .insert(commentVotes)
      .values({ commentId: id, anilistUserId: viewer.id })
      .onConflictDoNothing()
      .returning();
    if (added.length > 0) {
      const bumped = await db
        .update(comments)
        .set({ voteCount: sql`${comments.voteCount} + 1` })
        .where(eq(comments.id, id))
        .returning();
      if (bumped[0]) voteCount = bumped[0].voteCount;
    }
    cacheDel(firstPageKey(row));
    res.status(200).json({ voteCount, voted: true });
    return;
  }

  // DELETE: drop the viewer's vote; only decrement on a real removal, and never
  // below zero.
  const removed = await db
    .delete(commentVotes)
    .where(
      and(
        eq(commentVotes.commentId, id),
        eq(commentVotes.anilistUserId, viewer.id)
      )
    )
    .returning();
  if (removed.length > 0) {
    const bumped = await db
      .update(comments)
      .set({ voteCount: sql`greatest(${comments.voteCount} - 1, 0)` })
      .where(eq(comments.id, id))
      .returning();
    if (bumped[0]) voteCount = bumped[0].voteCount;
  }
  cacheDel(firstPageKey(row));
  res.status(200).json({ voteCount, voted: false });
};

export default handler;
