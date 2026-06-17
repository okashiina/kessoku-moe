import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
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
