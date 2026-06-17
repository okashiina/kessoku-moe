import type { NextApiRequest, NextApiResponse } from 'next';

import { eq } from 'drizzle-orm';

import { getDb, hasDb, schema } from '@utility/db/client';

// Drop a Web Push subscription by its endpoint. No auth needed: the endpoint is
// the secret unique key, so deleting by it can only remove the caller's own
// subscription. Idempotent — deleting a missing row is still a success.

interface UnsubscribeBody {
  endpoint?: string;
}

const handler = async (
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!hasDb()) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const body = (req.body || {}) as UnsubscribeBody;
  const endpoint = String(body.endpoint || '').trim();
  if (!endpoint) {
    res.status(400).json({ error: 'invalid_subscription' });
    return;
  }

  const db = getDb();
  if (!db) {
    res.status(503).json({ error: 'db_unconfigured' });
    return;
  }

  const { pushSubscriptions } = schema;
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));

  res.status(200).json({ ok: true });
};

export default handler;
