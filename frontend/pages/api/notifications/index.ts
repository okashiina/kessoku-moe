import type { NextApiRequest, NextApiResponse } from 'next';

import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import { getDb, hasDb, schema } from '@utility/db/client';
import { resolveViewer } from '@utility/db/viewer';
import type {
  NotificationItem,
  NotificationsResponse,
} from '@utility/notificationsTypes';

// The signed-in viewer's notification inbox: the 30 most recent + an unread
// count. Recipient is the SERVER-resolved viewer (the bearer's AniList id),
// never a client-supplied id, so one user can never read another's inbox.

const PAGE = 30;

type Row = typeof schema.notifications.$inferSelect;

const deepLink = (row: Row): string => {
  if (row.targetType === 'episode') {
    return `/watch/${row.anilistId}?episode=${row.episode}`;
  }
  if (row.targetType === 'manga') return `/manga/${row.anilistId}`;
  return `/anime/${row.anilistId}`;
};

const mapTargetType = (t: string): NotificationItem['targetType'] => {
  if (t === 'episode') return 'episode';
  if (t === 'manga') return 'manga';
  return 'anime';
};

const toItem = (row: Row): NotificationItem => ({
  id: row.id,
  type: row.type as NotificationItem['type'],
  actorName: row.actorName,
  commentId: row.commentId,
  anilistId: row.anilistId,
  targetType: mapTargetType(row.targetType),
  episode: row.episode,
  snippet: row.snippet,
  createdAt: row.createdAt.toISOString(),
  read: row.readAt !== null,
  href: deepLink(row),
});

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
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

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const { notifications } = schema;

  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientAnilistUserId, viewer.id))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(PAGE);

  const unreadRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientAnilistUserId, viewer.id),
        isNull(notifications.readAt)
      )
    );

  const body: NotificationsResponse = {
    items: rows.map(toItem),
    unread: unreadRows[0] ? Number(unreadRows[0].n) : 0,
  };
  res.status(200).json(body);
};

export default handler;
