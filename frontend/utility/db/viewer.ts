import type { NextApiRequest } from 'next';

import { LRUCache } from 'lru-cache';

// Server-side identity. The client is never trusted for who is subscribing: we
// take the AniList bearer token, resolve the real viewer from AniList, and cache
// it briefly (token -> viewer) so a burst of writes doesn't re-query each time.
// Reads are public; a write that needs an owner calls this and 401s on null.

export interface Viewer {
  id: number;
  name: string;
}

const ENDPOINT = 'https://graphql.anilist.co';
const VIEWER_Q = 'query { Viewer { id name } }';

const cache = new LRUCache<string, Viewer>({ max: 5000, ttl: 60_000 });

export const bearer = (req: NextApiRequest): string | null => {
  const raw = req.headers.authorization;
  const h = Array.isArray(raw) ? raw[0] : raw || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
};

export const resolveViewer = async (
  req: NextApiRequest
): Promise<Viewer | null> => {
  const token = bearer(req);
  if (!token) return null;
  const hit = cache.get(token);
  if (hit) return hit;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: VIEWER_Q }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { Viewer?: { id: number; name: string } | null };
    };
    const v = json?.data?.Viewer;
    if (!v?.id) return null;
    const viewer: Viewer = { id: v.id, name: v.name };
    cache.set(token, viewer);
    return viewer;
  } catch {
    return null;
  }
};
