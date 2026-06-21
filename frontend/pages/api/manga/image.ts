import { Readable } from 'node:stream';

import type { NextApiRequest, NextApiResponse } from 'next';

import {
  isMadaraImageHost,
  madaraImageContentType,
  relayEnabled,
  relayImageStream,
  streamMadaraImage,
} from '@utility/server/madara';
import { isMangadexImageHost, mdOpenImage } from '@utility/server/mangadex';
import { isWeebImageHost, WEEB_REFERER } from '@utility/server/weebcentral';

// Image proxy for manga page images + covers across providers.
//
// REQUIRED, not optional: both MangaDex (@home) and Weebcentral validate Referer
// and serve placeholders to hotlinks, and MangaDex hosts are DNS-poisoned in
// Indonesia. We fetch server-side (MangaDex via the DoH-resolving client, Weeb via
// plain fetch with its Referer) and stream the bytes back. Host allowlist guards
// against SSRF. See MANGA-ROADMAP §3.2.

export const config = {
  api: { responseLimit: false },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const { url, ref } = req.query;
  const target = typeof url === 'string' ? url : '';
  const referer = typeof ref === 'string' ? ref : '';

  const isMd = isMangadexImageHost(target);
  const allowed = isMd || isWeebImageHost(target) || isMadaraImageHost(target);
  if (!target || !allowed) {
    res.status(400).json({ error: 'invalid url' });
    return;
  }

  try {
    if (isMd) {
      const { status, headers, stream } = await mdOpenImage(target);
      if (status >= 400 || !stream) {
        res.status(status || 502).json({ error: `upstream ${status}` });
        stream?.resume();
        return;
      }
      const ct = headers['content-type'];
      if (ct) res.setHeader('Content-Type', ct);
      const len = headers['content-length'];
      if (len) res.setHeader('Content-Length', len);
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      res.status(status);
      stream.on('error', () => {
        if (!res.writableEnded) res.end();
      });
      stream.pipe(res);
      return;
    }

    if (isMadaraImageHost(target)) {
      // manhwatop is Cloudflare-protected (undici gets 403). In the cloud the
      // container's own curl is fingerprint-blocked, so prefer the residential
      // relay (it fetches the bytes for us); locally, stream via curl directly.
      if (relayEnabled()) {
        const stream = await relayImageStream(target);
        if (!stream) {
          res.status(502).json({ error: 'relay image failed' });
          return;
        }
        res.setHeader('Content-Type', madaraImageContentType(target));
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        res.status(200);
        stream.on('error', () => {
          if (!res.writableEnded) res.end();
        });
        stream.pipe(res);
        return;
      }
      const proc = streamMadaraImage(target);
      res.setHeader('Content-Type', madaraImageContentType(target));
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      res.status(200);
      proc.stdout.pipe(res);
      proc.on('error', () => {
        if (!res.writableEnded) res.status(502).end();
      });
      res.on('close', () => proc.kill());
      return;
    }

    // Weebcentral CDN: plain fetch with the site Referer.
    const upstream = await fetch(target, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        Referer: referer || WEEB_REFERER,
      },
    });
    if (!upstream.ok || !upstream.body) {
      res
        .status(upstream.status || 502)
        .json({ error: `upstream ${upstream.status}` });
      return;
    }
    const ct = upstream.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.status(200);
    Readable.fromWeb(
      upstream.body as Parameters<typeof Readable.fromWeb>[0]
    ).pipe(res);
  } catch {
    res.status(502).json({ error: 'upstream fetch failed' });
  }
}
