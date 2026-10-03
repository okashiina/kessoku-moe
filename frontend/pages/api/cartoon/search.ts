import type { NextApiRequest, NextApiResponse } from 'next';

import { searchCartoons } from '@utility/cartoon';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const query =
    typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  if (query.length < 2) return res.status(200).json({ results: [] });
  try {
    const shows = await searchCartoons(query);
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
    return res.status(200).json({
      results: shows.slice(0, 7).map((show) => ({
        id: show.id,
        name: show.name,
        cover: show.image?.medium || null,
        year: show.premiered?.slice(0, 4) || null,
      })),
    });
  } catch {
    return res
      .status(503)
      .json({ error: 'Cartoon search is temporarily unavailable' });
  }
}
