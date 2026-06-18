import type { NextApiRequest, NextApiResponse } from 'next';

import { eq } from 'drizzle-orm';

import {
  COMMENT_MAX,
  REPORT_HIDE_THRESHOLD,
  type CommentNode,
} from '@utility/commentsTypes';
import { cacheDel } from '@utility/db/cache';
import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { checkWriteRate, clientIp } from '@utility/db/writeRate';

// Edit (PATCH) or soft-delete (DELETE) the signed-in viewer's OWN comment.
// Ownership is checked against the server-resolved viewer, not the client.
// DELETE keeps the row (deleted_at) so a thread never loses its shape; both
// writes drop the target's cached first page. Rate limited per Rule 8 (fail
// open if the limiter itself throws).

const posInt = (v: unknown): number | null => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

type Row = typeof schema.comments.$inferSelect;

// The cache key is derived from the comment's own target so an edit/delete
// invalidates exactly the page that comment appears on.
const firstPageKey = (row: Row): string =>
  `comments:${row.targetType}:${row.anilistId}:${row.episode || 0}:p1`;

const toNode = (row: Row, viewerId: number): CommentNode => {
  const removed =
    row.deletedAt !== null || row.reportCount >= REPORT_HIDE_THRESHOLD;
  return {
    id: row.id,
    parentId: row.parentId,
    anilistUserId: row.anilistUserId,
    authorName: removed ? '' : row.authorName,
    authorAvatar: removed ? null : row.authorAvatar ?? null,
    body: removed ? '' : row.body,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    deleted: removed,
    reportCount: row.reportCount,
    mine: row.anilistUserId === viewerId,
    replies: [],
  };
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'PATCH, DELETE');
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

  const { comments } = schema;

  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.id, id))
    .limit(1);
  const row = rows[0];

  if (req.method === 'PATCH') {
    // A deleted comment is gone; editing it is a 404, not a 403.
    if (!row || row.deletedAt !== null) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (row.anilistUserId !== viewer.id) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const text = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (text.length < 1 || text.length > COMMENT_MAX) {
      res.status(400).json({ error: 'bad_body' });
      return;
    }

    const updated = await db
      .update(comments)
      .set({ body: text, editedAt: new Date() })
      .where(eq(comments.id, id))
      .returning();

    const next = updated[0];
    cacheDel(firstPageKey(next));
    res.status(200).json({ comment: toNode(next, viewer.id) });
    return;
  }

  // DELETE: a missing row is a 404; a present row not owned by the viewer is a
  // 403. Already-deleted rows are owned by the viewer too, so re-deleting is a
  // harmless no-op that still returns ok.
  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  if (row.anilistUserId !== viewer.id) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  await db
    .update(comments)
    .set({ deletedAt: new Date() })
    .where(eq(comments.id, id));

  cacheDel(firstPageKey(row));
  res.status(200).json({ ok: true });
};

export default handler;
