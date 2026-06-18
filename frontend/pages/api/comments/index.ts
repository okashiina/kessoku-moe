import type { NextApiRequest, NextApiResponse } from 'next';

import { and, desc, eq, isNull, lt, or } from 'drizzle-orm';

import {
  COMMENT_MAX,
  REPORT_HIDE_THRESHOLD,
  type CommentNode,
  type CommentsPage,
  type CommentTarget,
} from '@utility/commentsTypes';
import { cacheDel, cacheGet, cacheSet } from '@utility/db/cache';
import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import { checkWriteRate, clientIp } from '@utility/db/writeRate';

// Community comments for an anime or a single episode. GET is a public,
// keyset-paginated read (newest-first top-level comments with one nested level
// of replies); POST creates a comment or a (single-level) reply for the
// signed-in viewer. Author identity is server-resolved from the bearer — the
// client is never trusted for who is posting. The anonymous first page is cached
// briefly and dropped on any write to the same target; when a viewer is present
// we skip the cache entirely so each node's `mine` flag stays correct. Writes
// are rate limited per Rule 8 (fail open if the limiter itself throws).

const PAGE_SIZE = 20;
const REPLY_CAP = 50;

const posInt = (v: unknown): number | null => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const targetOf = (v: unknown): CommentTarget | null => {
  if (v === 'anime' || v === 'episode') return v;
  return null;
};

interface TargetKey {
  anilistId: number;
  targetType: CommentTarget;
  episode: number | null;
}

// Validate + normalise the (anilistId, targetType, episode) triple from a query
// or a body. Anime-level ignores any episode; episode-level requires a pos int.
const parseTarget = (src: {
  anilistId?: unknown;
  targetType?: unknown;
  episode?: unknown;
}): TargetKey | null => {
  const anilistId = posInt(src.anilistId);
  const targetType = targetOf(src.targetType);
  if (anilistId === null || targetType === null) return null;
  if (targetType === 'episode') {
    const episode = posInt(src.episode);
    if (episode === null) return null;
    return { anilistId, targetType, episode };
  }
  return { anilistId, targetType, episode: null };
};

const firstPageKey = (t: TargetKey): string =>
  `comments:${t.targetType}:${t.anilistId}:${t.episode || 0}:p1`;

interface Cursor {
  createdAt: Date;
  id: number;
}

const encodeCursor = (createdAt: Date, id: number): string =>
  Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64');

const decodeCursor = (raw: unknown): Cursor | null => {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const text = Buffer.from(raw, 'base64').toString('utf8');
    const sep = text.lastIndexOf('|');
    if (sep < 0) return null;
    const iso = text.slice(0, sep);
    const id = posInt(text.slice(sep + 1));
    const createdAt = new Date(iso);
    if (id === null || Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
};

type Row = typeof schema.comments.$inferSelect;

// A removed comment (soft-deleted or auto-hidden by reports) keeps its place in
// the tree for stable pagination, but its body and author are blanked so a
// pulled comment never leaks who wrote it or what it said.
const toNode = (row: Row, viewerId: number | null): CommentNode => {
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
    mine: viewerId !== null && row.anilistUserId === viewerId,
    replies: [],
  };
};

const matchEpisode = (episode: number | null) =>
  episode === null
    ? isNull(schema.comments.episode)
    : eq(schema.comments.episode, episode);

// Build the page: top-level rows (keyset), then every reply for those ids nested
// under its parent (capped defensively). Pure data assembly — no I/O here.
const buildPage = (
  topRows: Row[],
  replyRows: Row[],
  hasMore: boolean,
  viewerId: number | null
): CommentsPage => {
  const nodes = topRows.map((r) => toNode(r, viewerId));
  const byId = new Map<number, CommentNode>();
  nodes.forEach((n) => byId.set(n.id, n));

  replyRows.forEach((r) => {
    if (r.parentId === null) return;
    const parent = byId.get(r.parentId);
    if (!parent) return;
    if (parent.replies.length >= REPLY_CAP) return;
    parent.replies.push(toNode(r, viewerId));
  });

  const last = topRows[topRows.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return { comments: nodes, nextCursor };
};

const handleGet = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  const target = parseTarget(req.query);
  if (!target) {
    res.status(400).json({ error: 'bad_input' });
    return;
  }

  const cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    res.status(400).json({ error: 'bad_input' });
    return;
  }

  // Reads are public; resolve the viewer only to flag their own comments. The
  // cached path is the anonymous first page, so we never serve a stale `mine`.
  const viewer = await resolveViewer(req);
  const viewerId = viewer ? viewer.id : null;
  const cacheable = !cursor && viewerId === null;
  const key = firstPageKey(target);

  if (cacheable) {
    const cached = cacheGet<CommentsPage>(key);
    if (cached) {
      res.status(200).json(cached);
      return;
    }
  }

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const { comments } = schema;

  const where = and(
    eq(comments.anilistId, target.anilistId),
    eq(comments.targetType, target.targetType),
    matchEpisode(target.episode),
    isNull(comments.parentId),
    cursor
      ? or(
          lt(comments.createdAt, cursor.createdAt),
          and(
            eq(comments.createdAt, cursor.createdAt),
            lt(comments.id, cursor.id)
          )
        )
      : undefined
  );

  const topRows = await db
    .select()
    .from(comments)
    .where(where)
    .orderBy(desc(comments.createdAt), desc(comments.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = topRows.length > PAGE_SIZE;
  const pageRows = hasMore ? topRows.slice(0, PAGE_SIZE) : topRows;

  let replyRows: Row[] = [];
  if (pageRows.length > 0) {
    const ids = pageRows.map((r) => r.id);
    replyRows = await db
      .select()
      .from(comments)
      .where(or(...ids.map((id) => eq(comments.parentId, id))))
      .orderBy(comments.createdAt, comments.id);
  }

  const page = buildPage(pageRows, replyRows, hasMore, viewerId);

  if (cacheable) cacheSet(key, page);
  res.status(200).json(page);
};

interface CreateBody {
  anilistId?: unknown;
  targetType?: unknown;
  episode?: unknown;
  parentId?: unknown;
  body?: unknown;
}

const handlePost = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
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

  const body = (req.body || {}) as CreateBody;
  const target = parseTarget(body);
  if (!target) {
    res.status(400).json({ error: 'bad_input' });
    return;
  }

  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (text.length < 1 || text.length > COMMENT_MAX) {
    res.status(400).json({ error: 'bad_body' });
    return;
  }

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const { comments } = schema;

  let parentId: number | null = null;
  if (body.parentId !== undefined && body.parentId !== null) {
    parentId = posInt(body.parentId);
    if (parentId === null) {
      res.status(400).json({ error: 'bad_parent' });
      return;
    }
    // One level only: the parent must exist, not be deleted, sit on the same
    // target, and itself be top-level (a reply can't be replied to).
    const parents = await db
      .select()
      .from(comments)
      .where(eq(comments.id, parentId))
      .limit(1);
    const parent = parents[0];
    if (
      !parent ||
      parent.deletedAt !== null ||
      parent.parentId !== null ||
      parent.anilistId !== target.anilistId ||
      parent.targetType !== target.targetType ||
      (parent.episode ?? null) !== target.episode
    ) {
      res.status(400).json({ error: 'bad_parent' });
      return;
    }
  }

  const inserted = await db
    .insert(comments)
    .values({
      targetType: target.targetType,
      anilistId: target.anilistId,
      episode: target.episode,
      parentId,
      anilistUserId: viewer.id,
      authorName: viewer.name,
      authorAvatar: viewer.avatar ?? null,
      body: text,
    })
    .returning();

  const row = inserted[0];
  cacheDel(firstPageKey(target));

  const node = toNode(row, viewer.id);
  res.status(200).json({ comment: node });
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!hasDb()) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  if (req.method === 'GET') {
    await handleGet(req, res);
    return;
  }
  await handlePost(req, res);
};

export default handler;
