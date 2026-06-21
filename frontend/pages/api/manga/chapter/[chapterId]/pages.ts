import type { NextApiRequest, NextApiResponse } from 'next';

import { decodeRef } from '@utility/mangaRef';
import { getMadaraPages, MADARA_REFERER } from '@utility/server/madara';
import { buildPageUrls, getAtHome } from '@utility/server/mangadex';
import { getWeebPages, WEEB_REFERER } from '@utility/server/weebcentral';

// Returns a chapter's page image URLs, already wrapped in our /api/manga/image
// proxy, for both quality tiers. The chapterId is a provider ref (md_/wc_); we
// decode it and route to MangaDex @home (geo-optimized, expires ~15m, so never
// SSR-cached) or Weebcentral's CDN. See MANGA-ROADMAP §3.1.

const proxied = (urls: string[], ref?: string): string[] =>
  urls.map(
    (u) =>
      `/api/manga/image?url=${encodeURIComponent(u)}${
        ref ? `&ref=${encodeURIComponent(ref)}` : ''
      }`
  );

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const { chapterId } = req.query;
  const raw = typeof chapterId === 'string' ? chapterId : '';
  const ref = decodeRef(raw);
  if (!ref) {
    res.status(400).json({ error: 'bad chapter ref' });
    return;
  }

  try {
    if (ref.provider === 'wc') {
      const urls = await getWeebPages(ref.chapterId);
      if (!urls.length) {
        res.status(404).json({ error: 'no pages' });
        return;
      }
      const pages = proxied(urls, WEEB_REFERER);
      res.setHeader('Cache-Control', 'private, max-age=600');
      res.json({ pages, pagesDataSaver: pages }); // no data-saver tier on weeb
      return;
    }

    if (ref.provider === 'mh') {
      const urls = ref.madaraSlug
        ? await getMadaraPages(ref.madaraSlug, ref.chapterId)
        : [];
      if (!urls.length) {
        res.status(404).json({ error: 'no pages' });
        return;
      }
      const pages = proxied(urls, MADARA_REFERER);
      res.setHeader('Cache-Control', 'private, max-age=600');
      res.json({ pages, pagesDataSaver: pages });
      return;
    }

    const at = await getAtHome(ref.chapterId);
    res.setHeader('Cache-Control', 'private, max-age=300'); // @home expires ~15m
    res.json({
      hash: at.chapter.hash,
      pages: proxied(buildPageUrls(at, false)),
      pagesDataSaver: proxied(buildPageUrls(at, true)),
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 502;
    res.status(status === 404 ? 404 : 502).json({ error: 'pages failed' });
  }
}
