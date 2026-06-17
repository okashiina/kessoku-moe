import webpush from 'web-push';

// Web Push sender. Holds the VAPID config and the fan-out to a set of
// subscriptions. It deliberately does NOT import the DB: the cron route owns the
// data layer and this module is pulled in there, so importing the db here would
// risk a cycle. Dead endpoints (404 / 410 from the push service) are returned as
// `prunedIds` and the CALLER deletes them.

// VAPID identifies this server to the push services (FCM, Mozilla autopush,
// Apple). The public key is shared with the client (NEXT_PUBLIC); the private
// key is server-only. Configure once at module load, but only when both keys
// exist so an unconfigured deploy doesn't throw on import.
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@kessoku.moe';
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';

export const pushConfigured = (): boolean =>
  Boolean(VAPID_PRIVATE && VAPID_PUBLIC);

if (pushConfigured()) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  icon?: string;
  badge?: string;
}

export interface SendSub {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const DEFAULT_ICON = '/kessoku-moe-appicon.svg';
const DEFAULT_BADGE = '/kessoku-moe-icon.svg';

// A push service replies 404 (gone) or 410 (unsubscribed) for an endpoint that
// will never deliver again; those rows should be pruned. Other failures are
// transient and the row is kept for the next run.
const statusOf = (err: unknown): number | undefined => {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const code = (err as { statusCode?: unknown }).statusCode;
    return typeof code === 'number' ? code : undefined;
  }
  return undefined;
};

// Fan out one payload to many subscriptions concurrently. Returns how many the
// push service accepted and the ids of subscriptions that are permanently dead.
export const sendToSubscriptions = async (
  subs: SendSub[],
  payload: PushPayload
): Promise<{ sent: number; prunedIds: number[] }> => {
  if (!pushConfigured() || subs.length === 0) {
    return { sent: 0, prunedIds: [] };
  }

  const data = JSON.stringify({
    ...payload,
    icon: payload.icon || DEFAULT_ICON,
    badge: payload.badge || DEFAULT_BADGE,
  });

  interface SendResult {
    id: number;
    ok: boolean;
    dead: boolean;
  }

  const results = await Promise.allSettled<SendResult>(
    subs.map((sub) =>
      webpush
        .sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          data
        )
        .then(() => ({ id: sub.id, ok: true, dead: false }))
        .catch((err: unknown) => {
          const status = statusOf(err);
          return {
            id: sub.id,
            ok: false,
            dead: status === 404 || status === 410,
          };
        })
    )
  );

  let sent = 0;
  const prunedIds: number[] = [];
  results.forEach((r) => {
    if (r.status !== 'fulfilled') return;
    const v = r.value;
    if (v.ok) {
      sent += 1;
      return;
    }
    if (v.dead) prunedIds.push(v.id);
  });

  return { sent, prunedIds };
};
