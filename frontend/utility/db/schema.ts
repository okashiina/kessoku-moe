import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// Push-notification storage. AniList has no airing/per-episode push API and the
// app is otherwise local-first, so subscriptions + who-wants-what live here.
// Identity is dual (the agreed model): a signed-in viewer owns prefs by their
// AniList user id; a signed-out one owns them by an anonymous device id. Every
// write is keyed off a SERVER-resolved owner, never a client-claimed one.
//
// owner_kind/owner_id is the join key across the tables:
//   - 'user'   -> owner_id = AniList user id (as text)
//   - 'device' -> owner_id = anonymous device id

// A browser's Web Push subscription, one row per push endpoint (the natural
// unique key). owner_* is captured at subscribe time so a send fans straight
// from anime -> owners -> endpoints with no extra join.
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: serial('id').primaryKey(),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    ownerKind: text('owner_kind').notNull(),
    ownerId: text('owner_id').notNull(),
    anilistUserId: integer('anilist_user_id'),
    deviceId: text('device_id').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('push_sub_endpoint_unq').on(t.endpoint),
    index('push_sub_owner_idx').on(t.ownerKind, t.ownerId),
  ]
);

// Per-owner master switch + auto-from-Watching toggle.
export const notifyPrefs = pgTable(
  'notify_prefs',
  {
    id: serial('id').primaryKey(),
    ownerKind: text('owner_kind').notNull(),
    ownerId: text('owner_id').notNull(),
    masterEnabled: boolean('master_enabled').notNull().default(true),
    autoWatching: boolean('auto_watching').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex('notify_prefs_owner_unq').on(t.ownerKind, t.ownerId)]
);

// What each owner wants alerts for. `source` separates an explicit bell from a
// synced Watching-list entry, so re-syncing the Watching snapshot never disturbs
// hand-picked bells. The cron unions bells with watching rows (the latter only
// when prefs.autoWatching && masterEnabled).
export const notifyTargets = pgTable(
  'notify_targets',
  {
    id: serial('id').primaryKey(),
    ownerKind: text('owner_kind').notNull(),
    ownerId: text('owner_id').notNull(),
    anilistId: integer('anilist_id').notNull(),
    source: text('source').notNull(), // 'bell' | 'watching'
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex('notify_target_owner_anime_source_unq').on(
      t.ownerKind,
      t.ownerId,
      t.anilistId,
      t.source
    ),
    index('notify_target_anime_idx').on(t.anilistId),
  ]
);

// Per-episode community ratings. Separate from the show rating (listScore.ts,
// which syncs to AniList): these are our-DB-only, keyed by AniList media id +
// ABSOLUTE episode number. Rating requires AniList login so the average reflects
// real accounts (one row per user per episode); reads are public. Score is on
// the same 0-100 scoreRaw scale as the show rating, here entered on a 1-10 dial.
export const episodeRatings = pgTable(
  'episode_ratings',
  {
    id: serial('id').primaryKey(),
    anilistId: integer('anilist_id').notNull(),
    episode: integer('episode').notNull(),
    anilistUserId: integer('anilist_user_id').notNull(),
    score: smallint('score').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    // One rating per user per episode; its leftmost prefix (anilist_id, episode)
    // also serves the single-episode read and the GROUP BY episode batch.
    uniqueIndex('episode_rating_user_unq').on(
      t.anilistId,
      t.episode,
      t.anilistUserId
    ),
    check('episode_rating_score_range', sql`${t.score} between 1 and 100`),
  ]
);

// Dedupe: once a push for (anime, episode) has fanned out, never resend it.
export const notifyLog = pgTable(
  'notify_log',
  {
    id: serial('id').primaryKey(),
    anilistId: integer('anilist_id').notNull(),
    episode: integer('episode').notNull(),
    notifiedAt: timestamp('notified_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex('notify_log_anime_ep_unq').on(t.anilistId, t.episode)]
);

// Community comments on a show (target_type 'anime') or a single episode
// ('episode', keyed by ABSOLUTE episode number). Posting requires AniList login
// (author id/name/avatar are SERVER-resolved snapshots, never client-claimed);
// reads are public. One level of replies: parent_id points at a top-level
// comment, and depth is enforced in the route. Soft-deleted (deleted_at) so a
// thread keeps its shape; reported rows accrue report_count for cheap auto-hide.
export const comments = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    targetType: text('target_type').notNull(), // 'anime' | 'episode'
    anilistId: integer('anilist_id').notNull(),
    episode: integer('episode'), // null for anime-level
    parentId: integer('parent_id'), // null = top-level; else a top-level id
    anilistUserId: integer('anilist_user_id').notNull(),
    authorName: text('author_name').notNull(),
    authorAvatar: text('author_avatar'),
    body: text('body').notNull(),
    reportCount: integer('report_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    // Keyset pagination: top-level comments within a target, newest-first
    // (anilist_id, target_type, episode) then created_at desc, id desc.
    index('comments_target_idx').on(
      t.anilistId,
      t.targetType,
      t.episode,
      t.createdAt,
      t.id
    ),
    index('comments_parent_idx').on(t.parentId),
    check(
      'comments_target_type_chk',
      sql`${t.targetType} in ('anime', 'episode')`
    ),
    check(
      'comments_body_len_chk',
      sql`char_length(${t.body}) between 1 and 2000`
    ),
    // anime-level has no episode; episode-level must carry one.
    check(
      'comments_episode_shape_chk',
      sql`(${t.targetType} = 'episode') = (${t.episode} is not null)`
    ),
  ]
);

// One report per user per comment (the unique key); the running total is
// mirrored onto comments.report_count for a cheap auto-hide threshold.
export const commentReports = pgTable(
  'comment_reports',
  {
    id: serial('id').primaryKey(),
    commentId: integer('comment_id').notNull(),
    anilistUserId: integer('anilist_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [uniqueIndex('comment_report_unq').on(t.commentId, t.anilistUserId)]
);
