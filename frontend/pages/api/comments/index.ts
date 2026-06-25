import type { NextApiRequest, NextApiResponse } from 'next';

import { and, desc, eq, isNull, lt, or } from 'drizzle-orm';

import {
  COMMENT_MAX,
  REPORT_HIDE_THRESHOLD,
  type CommentNode,
  type CommentsPage,
  type CommentSort,
  type CommentTarget,
} from '@utility/commentsTypes';
import { cacheDel, cacheGet, cacheSet } from '@utility/db/cache';
import { getDb, hasDb, schema } from '@utility/db/client';
import { notifyReply } from '@utility/db/notifyReply';
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
  if (v === 'anime' || v === 'episode' || v === 'manga_chapter') return v;
  return null;
};

// Episode- and manga_chapter-level both require an integer in the `episode`
// column (the absolute episode number, or the chapter number for manga).
const needsEpisode = (t: CommentTarget): boolean =>
  t === 'episode' || t === 'manga_chapter';

interface TargetKey {
  anilistId: number;
  targetType: CommentTarget;
  episode: number | null;
}

// Validate + normalise the (anilistId, targetType, episode) triple from a query
// or a body. Anime-level ignores any episode; episode- and manga_chapter-level
// require a pos int (the chapter number for manga).
const parseTarget = (src: {
  anilistId?: unknown;
  targetType?: unknown;
  episode?: unknown;
}): TargetKey | null => {
  const anilistId = posInt(src.anilistId);
  const targetType = targetOf(src.targetType);
  if (anilistId === null || targetType === null) return null;
  if (needsEpisode(targetType)) {
    const episode = posInt(src.episode);
    if (episode === null) return null;
    return { anilistId, targetType, episode };
  }
  return { anilistId, targetType, episode: null };
};

const sortOf = (v: unknown): CommentSort => (v === 'top' ? 'top' : 'new');

// Only the default ('new') anonymous first page is cached; 'top' and authed
// reads always hit the DB, so a single per-target key invalidates correctly.
const firstPageKey = (t: TargetKey): string =>
  `comments:${t.targetType}:${t.anilistId}:${t.episode || 0}:p1`;

interface Cursor {
  sort: CommentSort;
  createdAt: Date;
  voteCount: number;
  id: number;
}

// The cursor self-describes its sort so a stale cursor from the other ordering
// is ignored rather than mis-paginating.
const encodeCursor = (sort: CommentSort, row: Row): string =>
  Buffer.from(
    `${sort}|${row.createdAt.toISOString()}|${row.voteCount}|${row.id}`,
    'utf8'
  ).toString('base64');

const decodeCursor = (raw: unknown): Cursor | null => {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const parts = Buffer.from(raw, 'base64').toString('utf8').split('|');
    if (parts.length !== 4) return null;
    const [s, iso, votes, idRaw] = parts;
    if (s !== 'new' && s !== 'top') return null;
    const id = posInt(idRaw);
    const voteCount = Math.trunc(Number(votes));
    const createdAt = new Date(iso);
    if (id === null || Number.isNaN(createdAt.getTime())) return null;
    if (!Number.isFinite(voteCount)) return null;
    return { sort: s, createdAt, voteCount, id };
  } catch {
    return null;
  }
};

type Row = typeof schema.comments.$inferSelect;

// A removed comment (soft-deleted or auto-hidden by reports) keeps its place in
// the tree for stable pagination, but its body and author are blanked so a
// pulled comment never leaks who wrote it or what it said.
const toNode = (
  row: Row,
  viewerId: number | null,
  votedIds: Set<number>
): CommentNode => {
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
    voteCount: row.voteCount,
    voted: votedIds.has(row.id),
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
  viewerId: number | null,
  votedIds: Set<number>,
  sort: CommentSort
): CommentsPage => {
  const nodes = topRows.map((r) => toNode(r, viewerId, votedIds));
  const byId = new Map<number, CommentNode>();
  nodes.forEach((n) => byId.set(n.id, n));

  replyRows.forEach((r) => {
    if (r.parentId === null) return;
    const parent = byId.get(r.parentId);
    if (!parent) return;
    if (parent.replies.length >= REPLY_CAP) return;
    parent.replies.push(toNode(r, viewerId, votedIds));
  });

  const last = topRows[topRows.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(sort, last) : null;

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

  const sort = sortOf(req.query.sort);

  let cursor = decodeCursor(req.query.cursor);
  if (req.query.cursor && !cursor) {
    res.status(400).json({ error: 'bad_input' });
    return;
  }
  // A cursor from the other ordering can't paginate this one — drop it.
  if (cursor && cursor.sort !== sort) cursor = null;

  // Reads are public; resolve the viewer only to flag their own comments + which
  // ones they've upvoted. Only the default ('new') anonymous first page is
  // cached, so we never serve a stale `mine`/`voted`.
  const viewer = await resolveViewer(req);
  const viewerId = viewer ? viewer.id : null;
  const cacheable = !cursor && viewerId === null && sort === 'new';
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

  const { comments, commentVotes } = schema;

  // Keyset boundary for the active ordering: 'new' walks (createdAt, id), 'top'
  // walks (voteCount, id), both descending.
  let keyset;
  if (cursor && sort === 'top') {
    keyset = or(
      lt(comments.voteCount, cursor.voteCount),
      and(eq(comments.voteCount, cursor.voteCount), lt(comments.id, cursor.id))
    );
  } else if (cursor) {
    keyset = or(
      lt(comments.createdAt, cursor.createdAt),
      and(eq(comments.createdAt, cursor.createdAt), lt(comments.id, cursor.id))
    );
  }

  const where = and(
    eq(comments.anilistId, target.anilistId),
    eq(comments.targetType, target.targetType),
    matchEpisode(target.episode),
    isNull(comments.parentId),
    keyset
  );

  const order =
    sort === 'top'
      ? [desc(comments.voteCount), desc(comments.id)]
      : [desc(comments.createdAt), desc(comments.id)];

  const topRows = await db
    .select()
    .from(comments)
    .where(where)
    .orderBy(...order)
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

  // Which of the shown comments the viewer has upvoted (for the filled arrow).
  const votedIds = new Set<number>();
  if (viewerId !== null) {
    const shownIds = [...pageRows, ...replyRows].map((r) => r.id);
    if (shownIds.length > 0) {
      const voted = await db
        .select({ commentId: commentVotes.commentId })
        .from(commentVotes)
        .where(
          and(
            eq(commentVotes.anilistUserId, viewerId),
            or(...shownIds.map((id) => eq(commentVotes.commentId, id)))
          )
        );
      voted.forEach((v) => votedIds.add(v.commentId));
    }
  }

  const page = buildPage(
    pageRows,
    replyRows,
    hasMore,
    viewerId,
    votedIds,
    sort
  );

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
  let parentAuthorId: number | null = null;
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
    parentAuthorId = parent.anilistUserId;
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

  const node = toNode(row, viewer.id, new Set());
  res.status(200).json({ comment: node });

  // Notify the parent author (in-app inbox + best-effort push). Fire-and-forget
  // so the reply response isn't held up by the push fan-out; notifyReply
  // swallows its own errors and skips a self-reply.
  // ponytail: notifyReply (out of scope here) only models anime/episode deep
  // links, so manga_chapter replies skip the notification rather than emit a
  // wrong /anime link. Upgrade path: teach notifyReply a /read deep link.
  if (
    parentId !== null &&
    parentAuthorId !== null &&
    target.targetType !== 'manga_chapter'
  ) {
    notifyReply(db, {
      recipientId: parentAuthorId,
      actorId: viewer.id,
      actorName: viewer.name,
      commentId: row.id,
      anilistId: target.anilistId,
      targetType: target.targetType,
      episode: target.episode,
      snippet: text,
    }).catch(() => undefined);
  }
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
