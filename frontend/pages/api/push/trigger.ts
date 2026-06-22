import type { NextApiRequest, NextApiResponse } from 'next';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { getDb, hasDb, schema } from '@utility/db/client';
import { bearer } from '@utility/db/viewer';
import { fetchMangaDetail, mangaSearchTitles } from '@utility/manga';
import {
  pushConfigured,
  sendToSubscriptions,
  type SendSub,
} from '@utility/push/server';
import { getChapterFeed, resolveByAniList } from '@utility/server/mangadex';

// The cron entrypoint and the heart of "it actually works". On each run it:
//   1. gathers every anime id any active owner wants alerts for (bells, plus
//      watching rows when that owner opted into auto-from-Watching),
//   2. asks AniList which of those aired an episode in the recent window,
//   3. for each aired episode not already logged, fans a push to the owners who
//      want that anime, prunes dead subscriptions, and logs (anime, episode) so
//      it never double-sends.
// It is defensive throughout: one AniList chunk failing must not 500 the run.

const CRON_SECRET = process.env.CRON_SECRET || '';
const LOOKBACK_SECONDS =
  Number(process.env.PUSH_LOOKBACK_SECONDS) > 0
    ? Number(process.env.PUSH_LOOKBACK_SECONDS)
    : 3 * 3600;

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const ID_CHUNK = 50;

// ponytail: cap how many distinct manga we resolve per run so a large bell list
// can't blow the 15-min cron budget (each manga is a throttled MangaDex feed
// fetch). Unscanned manga simply roll over to the next run. Raise via
// MANGA_PUSH_MAX_PER_RUN, or move to a cursor if the backlog ever grows.
const MANGA_MAX_PER_RUN =
  Number(process.env.MANGA_PUSH_MAX_PER_RUN) > 0
    ? Number(process.env.MANGA_PUSH_MAX_PER_RUN)
    : 40;

const SCHEDULE_QUERY = `
query($ids:[Int], $from:Int, $to:Int, $page:Int){
  Page(page:$page, perPage:50){
    pageInfo{ hasNextPage }
    airingSchedules(mediaId_in:$ids, airingAt_greater:$from, airingAt_lesser:$to){
      mediaId
      episode
      airingAt
      media{ title{ romaji english } }
    }
  }
}`;

interface AiredSchedule {
  mediaId: number;
  episode: number;
  airingAt: number;
  title: string;
}

const log = (msg: string, err?: unknown): void => {
  // eslint-disable-next-line no-console
  console.error(`[push/trigger] ${msg}`, err ?? '');
};

// Fetch every aired schedule for one batch of ids, walking AniList's pages.
// Returns [] on any failure so a flaky chunk degrades gracefully.
const fetchSchedulesForChunk = async (
  ids: number[],
  from: number,
  to: number
): Promise<AiredSchedule[]> => {
  const collected: AiredSchedule[] = [];
  let page = 1;
  let hasNext = true;

  while (hasNext) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resp = await fetch(ANILIST_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: SCHEDULE_QUERY,
          variables: { ids, from, to, page },
        }),
      });
      if (!resp.ok) {
        log(`anilist http ${resp.status} for chunk page ${page}`);
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      const json = (await resp.json()) as {
        data?: {
          Page?: {
            pageInfo?: { hasNextPage?: boolean };
            airingSchedules?: Array<{
              mediaId?: number;
              episode?: number;
              airingAt?: number;
              media?: { title?: { romaji?: string; english?: string } };
            }>;
          };
        };
      };
      const pageData = json?.data?.Page;
      const schedules = pageData?.airingSchedules || [];
      schedules.forEach((s) => {
        if (
          typeof s.mediaId !== 'number' ||
          typeof s.episode !== 'number' ||
          typeof s.airingAt !== 'number'
        ) {
          return;
        }
        const title =
          s.media?.title?.english || s.media?.title?.romaji || 'New episode';
        collected.push({
          mediaId: s.mediaId,
          episode: s.episode,
          airingAt: s.airingAt,
          title,
        });
      });
      hasNext = Boolean(pageData?.pageInfo?.hasNextPage);
      page += 1;
      // Hard cap on pages to avoid an unbounded loop on a bad response.
      if (page > 20) hasNext = false;
    } catch (err) {
      log('anilist fetch failed for chunk', err);
      hasNext = false;
    }
  }

  return collected;
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  let i = 0;
  while (i < arr.length) {
    out.push(arr.slice(i, i + size));
    i += size;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Manga pass. Mirrors the anime flow but for "new chapter available": each
// owner has at most one manga_notify_targets row per manga, carrying the
// highest chapter we've already told them about (last_chapter). For every
// subscribed manga we resolve the current latest chapter from MangaDex and, for
// each owner who is behind, push + (optionally) inbox + advance their
// last_chapter. Defensive throughout: one manga or one owner failing must not
// abort the run.
// ---------------------------------------------------------------------------

type Db = NonNullable<ReturnType<typeof getDb>>;

// Chapter numbers are strings on the wire ("12", "12.5", "Oneshot"). Parse to a
// comparable float; non-numeric / missing -> null (treated as "no chapter").
const chapterToNum = (raw: string | null | undefined): number | null => {
  if (raw == null) return null;
  const n = parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
};

// Latest chapter number for an AniList manga id, via MangaDex only. Resolves the
// AniList id -> MangaDex manga (link-indexed, else best title hit), then takes
// the max chapter across its feed in our reader languages. NSFW on: a bell is an
// explicit opt-in, so adult titles must still resolve. Returns null on any miss
// (unmatched title, empty feed, network) so the caller skips it this run.
const latestChapterFor = async (
  anilistId: number,
  titles: string[]
): Promise<number | null> => {
  const md = await resolveByAniList(anilistId, titles, true);
  if (!md) return null;
  const feed = await getChapterFeed(md.id, ['id', 'en', 'ja'], true);
  let max: number | null = null;
  feed.forEach((c) => {
    if (c.attributes.externalUrl) return; // unreadable external link
    const n = chapterToNum(c.attributes.chapter);
    if (n != null && (max == null || n > max)) max = n;
  });
  return max;
};

interface MangaPassResult {
  checked: number;
  fired: number;
  sent: number;
  pruned: number;
}

const runMangaPass = async (db: Db): Promise<MangaPassResult> => {
  const { mangaNotifyTargets, pushSubscriptions, notifyPrefs, notifications } =
    schema;
  const result: MangaPassResult = { checked: 0, fired: 0, sent: 0, pruned: 0 };

  // Every bell row (owner + manga + their last_chapter snapshot + title).
  const targets = await db
    .select({
      id: mangaNotifyTargets.id,
      ownerKind: mangaNotifyTargets.ownerKind,
      ownerId: mangaNotifyTargets.ownerId,
      anilistId: mangaNotifyTargets.anilistId,
      title: mangaNotifyTargets.title,
      lastChapter: mangaNotifyTargets.lastChapter,
    })
    .from(mangaNotifyTargets);
  if (targets.length === 0) return result;

  // Distinct manga ids, capped per run (ponytail budget guard).
  const distinctIds = Array.from(
    new Set(targets.map((t) => t.anilistId))
  ).slice(0, MANGA_MAX_PER_RUN);
  result.checked = distinctIds.length;

  // A stored bell title snapshot for a manga id, if any (fallback when AniList
  // is unreachable for resolution + display).
  const snapshotTitle = (id: number): string | null =>
    targets.find((t) => t.anilistId === id && t.title)?.title ?? null;

  // Resolve each manga's latest chapter once, cached for the run. A failure for
  // one manga leaves it absent from the map -> its owners are skipped this run.
  const latestById = new Map<number, number>();
  const titleById = new Map<number, string>();
  // eslint-disable-next-line no-restricted-syntax
  for (const id of distinctIds) {
    try {
      // AniList titles drive MangaDex resolution; fall back to the stored bell
      // title snapshot if AniList is unreachable.
      // eslint-disable-next-line no-await-in-loop
      const detail = await fetchMangaDetail(id);
      const snap = snapshotTitle(id);
      const titles = detail
        ? mangaSearchTitles(detail)
        : [snap].filter((s): s is string => Boolean(s));
      const display =
        detail?.title.english ||
        detail?.title.romaji ||
        detail?.title.native ||
        snap ||
        'your manga';
      titleById.set(id, display);
      // eslint-disable-next-line no-await-in-loop
      const latest = await latestChapterFor(id, titles);
      if (latest != null) latestById.set(id, latest);
    } catch (err) {
      log(`manga resolve failed for ${id}`, err);
    }
  }

  // Handle one owner+manga target end to end: behind-check, fan a push to that
  // owner's subscriptions, (optionally) write the inbox row, advance the
  // watermark. Early returns keep it flat and avoid `continue` (repo eslint
  // forbids it). Returns counts to fold into the pass total.
  type Target = typeof targets[number];
  const processTarget = async (
    t: Target
  ): Promise<{ fired: boolean; sent: number; pruned: number }> => {
    const noop = { fired: false, sent: 0, pruned: 0 };

    const latest = latestById.get(t.anilistId);
    if (latest == null) return noop; // unresolved this run
    const prev = chapterToNum(t.lastChapter);
    if (prev != null && latest <= prev) return noop; // already caught up

    const title = titleById.get(t.anilistId) || t.title || 'your manga';
    const latestLabel = Number.isInteger(latest)
      ? String(latest)
      : latest.toFixed(1);

    // Owner's live subscriptions.
    const subRows = await db
      .select({
        id: pushSubscriptions.id,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.ownerKind, t.ownerKind),
          eq(pushSubscriptions.ownerId, t.ownerId)
        )
      );

    // Master switch gates push (default on when no prefs row).
    const prefs = await db
      .select({ masterEnabled: notifyPrefs.masterEnabled })
      .from(notifyPrefs)
      .where(
        and(
          eq(notifyPrefs.ownerKind, t.ownerKind),
          eq(notifyPrefs.ownerId, t.ownerId)
        )
      )
      .limit(1);
    const muted = prefs[0]?.masterEnabled === false;

    let fired = false;
    let sent = 0;
    let pruned = 0;

    if (subRows.length > 0 && !muted) {
      const subs: SendSub[] = subRows.map((s) => ({
        id: s.id,
        endpoint: s.endpoint,
        p256dh: s.p256dh,
        auth: s.auth,
      }));
      const sendResult = await sendToSubscriptions(subs, {
        title: 'New chapter',
        body: `${title} - Chapter ${latestLabel} is out`,
        url: `/manga/${t.anilistId}`,
        tag: `manga-${t.anilistId}-${latestLabel}`,
      });
      fired = true;
      sent = sendResult.sent;
      if (sendResult.prunedIds.length) {
        pruned = sendResult.prunedIds.length;
        await db
          .delete(pushSubscriptions)
          .where(inArray(pushSubscriptions.id, sendResult.prunedIds));
      }
    }

    // In-app inbox row (signed-in owners only; recipient is an AniList user
    // id). The inbox renderer + API now understand the 'manga_chapter' type.
    // ponytail: reuse the 'reply'-shaped notifications table — commentId 0 (no
    // comment; column is NOT NULL but unconstrained), targetType 'manga' (no DB
    // check on this column), episode = floored chapter for the int column.
    if (t.ownerKind === 'user' && !muted) {
      const recipientId = Number(t.ownerId);
      if (Number.isInteger(recipientId)) {
        await db.insert(notifications).values({
          recipientAnilistUserId: recipientId,
          type: 'manga_chapter',
          actorName: title,
          commentId: 0,
          anilistId: t.anilistId,
          targetType: 'manga',
          episode: Math.floor(latest),
          snippet: `Chapter ${latestLabel} is out`,
        });
      }
    }

    // Advance this owner's watermark regardless of whether a push went out (no
    // live subs / muted) so we don't re-evaluate it forever.
    await db
      .update(mangaNotifyTargets)
      .set({ lastChapter: latestLabel })
      .where(eq(mangaNotifyTargets.id, t.id));

    return { fired, sent, pruned };
  };

  // Process targets sequentially so a burst doesn't open too many push
  // connections at once and each watermark advance lands before the next.
  // eslint-disable-next-line no-restricted-syntax
  for (const t of targets) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await processTarget(t);
      if (r.fired) result.fired += 1;
      result.sent += r.sent;
      result.pruned += r.pruned;
    } catch (err) {
      log(`manga notify failed for target ${t.id}`, err);
    }
  }

  return result;
};

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!CRON_SECRET) {
    res.status(503).json({ error: 'cron_unconfigured' });
    return;
  }
  const queryKey = Array.isArray(req.query.key)
    ? req.query.key[0]
    : req.query.key;
  const authed = bearer(req) === CRON_SECRET || queryKey === CRON_SECRET;
  if (!authed) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  if (!hasDb()) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }
  if (!pushConfigured()) {
    res.status(503).json({ error: 'push_unconfigured' });
    return;
  }

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }
  const { notifyTargets, notifyPrefs, notifyLog, pushSubscriptions } = schema;

  // --- 1. Gather the anime ids any active owner wants. ---------------------
  // A target is "active" when:
  //   - it's a bell AND the owner's prefs master switch is on (or no prefs row,
  //     which defaults to on), OR
  //   - it's watching AND the owner has master on AND autoWatching on.
  // We left-join prefs so an owner with no prefs row is treated as the defaults
  // (masterEnabled true, autoWatching false).
  const activeTargets = await db
    .select({
      ownerKind: notifyTargets.ownerKind,
      ownerId: notifyTargets.ownerId,
      anilistId: notifyTargets.anilistId,
      source: notifyTargets.source,
    })
    .from(notifyTargets)
    .leftJoin(
      notifyPrefs,
      and(
        eq(notifyPrefs.ownerKind, notifyTargets.ownerKind),
        eq(notifyPrefs.ownerId, notifyTargets.ownerId)
      )
    )
    .where(
      sql`
        coalesce(${notifyPrefs.masterEnabled}, true) = true
        AND (
          ${notifyTargets.source} = 'bell'
          OR (
            ${notifyTargets.source} = 'watching'
            AND coalesce(${notifyPrefs.autoWatching}, false) = true
          )
        )
      `
    );

  const wantedIds = Array.from(new Set(activeTargets.map((t) => t.anilistId)));

  // Anime counts, accumulated as we go. The manga pass (further down) always
  // runs even when there is no anime work, so we no longer early-return here —
  // we fall through to runMangaPass() and report both in one JSON body.
  let animeFired = 0;
  let animeSent = 0;
  let animePruned = 0;

  // anime id -> the set of owners (keyed "ownerKind ownerId") who actively want
  // alerts for it, so a send fans straight from anime to those owners.
  const recipientsByAnime = new Map<number, Set<string>>();
  activeTargets.forEach((t) => {
    const ownerKey = `${t.ownerKind} ${t.ownerId}`;
    let set = recipientsByAnime.get(t.anilistId);
    if (!set) {
      set = new Set<string>();
      recipientsByAnime.set(t.anilistId, set);
    }
    set.add(ownerKey);
  });

  // --- 2. Ask AniList what aired in the window. ---------------------------
  const now = Math.floor(Date.now() / 1000);
  const from = now - LOOKBACK_SECONDS;
  const idChunks = chunk(wantedIds, ID_CHUNK);

  // Skip the AniList round-trip entirely when no one wants any anime alerts;
  // the manga pass still runs below.
  const chunkResults =
    wantedIds.length === 0
      ? []
      : await Promise.all(
          idChunks.map((ids) => fetchSchedulesForChunk(ids, from, now))
        );
  const aired = chunkResults.flat();

  // Insert the dedupe-log row for an (anime, episode) so a future run never
  // resends it. Idempotent via the unique index.
  const markLogged = (anilistId: number, episode: number): Promise<unknown> =>
    db
      .insert(notifyLog)
      .values({ anilistId, episode })
      .onConflictDoNothing({
        target: [notifyLog.anilistId, notifyLog.episode],
      });

  // Handle one aired episode end to end: dedupe-check, resolve recipients, fan
  // out the push, prune dead endpoints, and log. Early returns keep the body
  // flat and avoid `continue`, which the repo eslint forbids.
  const processEpisode = async (
    ep: AiredSchedule
  ): Promise<{ fired: boolean; sent: number; pruned: number }> => {
    const noop = { fired: false, sent: 0, pruned: 0 };

    const existing = await db
      .select({ id: notifyLog.id })
      .from(notifyLog)
      .where(
        and(
          eq(notifyLog.anilistId, ep.mediaId),
          eq(notifyLog.episode, ep.episode)
        )
      )
      .limit(1);
    if (existing.length) return noop;

    const ownerKeys = recipientsByAnime.get(ep.mediaId);
    if (!ownerKeys || ownerKeys.size === 0) return noop;

    // Resolve this anime's recipient owners to their subscriptions. We query
    // per (ownerKind, ownerId); a small set in practice.
    const ownerPairs = Array.from(ownerKeys).map((k) => {
      const [ownerKind, ownerId] = k.split(' ');
      return { ownerKind, ownerId };
    });

    const subRows = await Promise.all(
      ownerPairs.map((o) =>
        db
          .select({
            id: pushSubscriptions.id,
            endpoint: pushSubscriptions.endpoint,
            p256dh: pushSubscriptions.p256dh,
            auth: pushSubscriptions.auth,
          })
          .from(pushSubscriptions)
          .where(
            and(
              eq(pushSubscriptions.ownerKind, o.ownerKind),
              eq(pushSubscriptions.ownerId, o.ownerId)
            )
          )
      )
    );

    // Flatten + dedupe subscriptions by id (an owner could in theory match more
    // than once; an id never sends twice).
    const seen = new Set<number>();
    const subs: SendSub[] = [];
    subRows.flat().forEach((s) => {
      if (seen.has(s.id)) return;
      seen.add(s.id);
      subs.push(s);
    });

    if (subs.length === 0) {
      // No live subscriptions, but still log so we don't re-evaluate forever.
      await markLogged(ep.mediaId, ep.episode);
      return noop;
    }

    const { sent, prunedIds } = await sendToSubscriptions(subs, {
      title: 'New episode',
      body: `${ep.title} - Episode ${ep.episode} is out`,
      url: `/anime/${ep.mediaId}`,
      tag: `ep-${ep.mediaId}-${ep.episode}`,
    });

    if (prunedIds.length) {
      await db
        .delete(pushSubscriptions)
        .where(inArray(pushSubscriptions.id, prunedIds));
    }

    await markLogged(ep.mediaId, ep.episode);
    return { fired: true, sent, pruned: prunedIds.length };
  };

  // --- 3. For each aired episode, send to its recipients (skip logged). ---
  // Process sequentially so a burst doesn't open too many push connections at
  // once and so each log insert lands before the next episode is considered.
  const ordered = aired.slice();
  // eslint-disable-next-line no-restricted-syntax
  for (const ep of ordered) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await processEpisode(ep);
      if (r.fired) animeFired += 1;
      animeSent += r.sent;
      animePruned += r.pruned;
    } catch (err) {
      log(`failed to process ep ${ep.mediaId}-${ep.episode}`, err);
    }
  }

  // --- 4. Manga pass: same idea for "new chapter available". --------------
  // Bells live in manga_notify_targets (one row per owner+manga). Dedupe is
  // per-owner via that row's last_chapter, so there is no separate log table.
  // ponytail: latest-chapter resolution is MangaDex-only here (resolveByAniList
  // + getChapterFeed) — the fast, link-indexed source — even though the manga
  // detail page also reads Weeb Central / manhwatop. Upgrade: union the other
  // resolvers if a subscribed title is MangaDex-absent and users notice gaps.
  const manga = await runMangaPass(db).catch((err) => {
    log('manga pass failed', err);
    return { checked: 0, fired: 0, sent: 0, pruned: 0 };
  });

  res.status(200).json({
    checked: wantedIds.length,
    fired: animeFired,
    sent: animeSent,
    pruned: animePruned,
    mangaChecked: manga.checked,
    mangaFired: manga.fired,
    mangaSent: manga.sent,
    mangaPruned: manga.pruned,
  });
};

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default handler;
