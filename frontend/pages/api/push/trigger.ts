import type { NextApiRequest, NextApiResponse } from 'next';

import { and, eq, inArray, sql } from 'drizzle-orm';

import { getDb, hasDb, schema } from '@utility/db/client';
import { bearer } from '@utility/db/viewer';
import {
  pushConfigured,
  sendToSubscriptions,
  type SendSub,
} from '@utility/push/server';

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

  if (wantedIds.length === 0) {
    res.status(200).json({ checked: 0, fired: 0, sent: 0, pruned: 0 });
    return;
  }

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

  const chunkResults = await Promise.all(
    idChunks.map((ids) => fetchSchedulesForChunk(ids, from, now))
  );
  const aired = chunkResults.flat();

  if (aired.length === 0) {
    res.status(200).json({
      checked: wantedIds.length,
      fired: 0,
      sent: 0,
      pruned: 0,
    });
    return;
  }

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
  let fired = 0;
  let totalSent = 0;
  let totalPruned = 0;

  const ordered = aired.slice();
  // eslint-disable-next-line no-restricted-syntax
  for (const ep of ordered) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await processEpisode(ep);
      if (r.fired) fired += 1;
      totalSent += r.sent;
      totalPruned += r.pruned;
    } catch (err) {
      log(`failed to process ep ${ep.mediaId}-${ep.episode}`, err);
    }
  }

  res.status(200).json({
    checked: wantedIds.length,
    fired,
    sent: totalSent,
    pruned: totalPruned,
  });
};

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

export default handler;
