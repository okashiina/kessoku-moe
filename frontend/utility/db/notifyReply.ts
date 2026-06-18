import { and, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import {
  pushConfigured,
  sendToSubscriptions,
  type SendSub,
} from '@utility/push/server';

import * as schema from './schema';

// Fan out a "someone replied to your comment" notification: always write the
// in-app inbox row, and (when push is configured + the recipient hasn't muted
// their master switch) also send a web push to their devices. Everything here is
// best-effort and swallowed — a notification failure must never break posting
// the reply. The DB is passed in by the caller (the comments route owns it).

type Db = NodePgDatabase<typeof schema>;

export interface ReplyNotifyInput {
  recipientId: number;
  actorId: number;
  actorName: string;
  commentId: number; // the reply that triggered it
  anilistId: number;
  targetType: 'anime' | 'episode';
  episode: number | null;
  snippet: string;
}

const deepLink = (i: ReplyNotifyInput): string =>
  i.targetType === 'episode'
    ? `/watch/${i.anilistId}?episode=${i.episode}`
    : `/anime/${i.anilistId}`;

export const notifyReply = async (
  db: Db,
  input: ReplyNotifyInput
): Promise<void> => {
  if (input.recipientId === input.actorId) return; // never notify a self-reply
  const { notifications, notifyPrefs, pushSubscriptions } = schema;
  const snippet = input.snippet.slice(0, 140);

  try {
    await db.insert(notifications).values({
      recipientAnilistUserId: input.recipientId,
      type: 'reply',
      actorName: input.actorName,
      commentId: input.commentId,
      anilistId: input.anilistId,
      targetType: input.targetType,
      episode: input.episode,
      snippet,
    });
  } catch {
    // Inbox insert is best-effort; a failure here still lets the reply post.
  }

  if (!pushConfigured()) return;

  try {
    const owner = String(input.recipientId);
    // The master switch gates push (default on when there is no prefs row).
    const prefs = await db
      .select()
      .from(notifyPrefs)
      .where(
        and(eq(notifyPrefs.ownerKind, 'user'), eq(notifyPrefs.ownerId, owner))
      )
      .limit(1);
    if (prefs[0] && prefs[0].masterEnabled === false) return;

    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.ownerKind, 'user'),
          eq(pushSubscriptions.ownerId, owner)
        )
      );
    if (subs.length === 0) return;

    const sendSubs: SendSub[] = subs.map((s) => ({
      id: s.id,
      endpoint: s.endpoint,
      p256dh: s.p256dh,
      auth: s.auth,
    }));

    const { prunedIds } = await sendToSubscriptions(sendSubs, {
      title: `${input.actorName} replied to you`,
      body: snippet,
      url: deepLink(input),
      tag: `reply-${input.commentId}`,
    });

    if (prunedIds.length > 0) {
      await db
        .delete(pushSubscriptions)
        .where(inArray(pushSubscriptions.id, prunedIds));
    }
  } catch {
    // Push is best-effort; the in-app row above already landed.
  }
};
