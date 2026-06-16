import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { isFetchUrlSafe } from './ssrfGuard.js';

// HLS proxy (like Miruro's ultracloud.cc): fetch the playlist/segments with the
// right Referer/Origin and rewrite every nested URL to come back through here, so
// the browser can play a cross-origin, hotlink-protected stream.

const isPlaylist = (ct: string, url: string) =>
  ct.includes('mpegurl') || ct.includes('vnd.apple') || url.split('?')[0].endsWith('.m3u8');

function proxify(target: string, ref: string): string {
  return `/hls?url=${encodeURIComponent(target)}&ref=${encodeURIComponent(ref)}`;
}

function rewritePlaylist(text: string, baseUrl: string, ref: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      // Rewrite key/map URIs embedded in tags, e.g. #EXT-X-KEY:URI="..."
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
          const abs = new URL(uri, baseUrl).toString();
          return `URI="${proxify(abs, ref)}"`;
        });
      }
      // Otherwise it's a segment or sub-playlist URL line.
      const abs = new URL(trimmed, baseUrl).toString();
      return proxify(abs, ref);
    })
    .join('\n');
}

export async function handleHls(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { url, ref } = req.query as { url?: string; ref?: string };
  if (!url) {
    reply.code(400).send({ error: 'missing url' });
    return;
  }
  if (!(await isFetchUrlSafe(url))) {
    reply.code(400).send({ error: 'invalid url' });
    return;
  }
  const referer = ref || '';
  // Origin must be derived only from a parseable Referer; a non-empty but invalid
  // ref used to throw on new URL() and 500 the request, so guard it here and fall
  // back to sending just the Referer (or neither) when it does not parse.
  let refHeaders: Record<string, string> = {};
  if (referer) {
    try {
      refHeaders = { Referer: referer, Origin: new URL(referer).origin };
    } catch {
      refHeaders = { Referer: referer };
    }
  }
  const upstream = await fetch(url, {
    headers: {
      'User-Agent': config.userAgent,
      ...refHeaders,
    },
  });

  if (!upstream.ok || !upstream.body) {
    reply.code(upstream.status || 502).send({ error: `upstream ${upstream.status}` });
    return;
  }

  const ct = (upstream.headers.get('content-type') || '').toLowerCase();
  reply.header('Access-Control-Allow-Origin', '*');

  if (isPlaylist(ct, url)) {
    const text = await upstream.text();
    reply
      .header('content-type', 'application/vnd.apple.mpegurl')
      .send(rewritePlaylist(text, url, referer));
    return;
  }

  // Binary segment / key: buffer + send. (Streaming via Readable.fromWeb returned
  // an empty body here; segments are small ~200KB so buffering is fine + robust.)
  const buf = Buffer.from(await upstream.arrayBuffer());
  reply.header('content-type', ct || 'application/octet-stream');
  // Let the browser + a CDN cache segments/keys so repeats don't re-hit this box
  // (STREAMING-ROADMAP §13 wall 1), but respect the upstream's own directive when
  // it set one, and avoid `immutable` so a rotated upstream URL can still
  // revalidate. The rewritten playlist above is left uncached.
  reply.header(
    'Cache-Control',
    upstream.headers.get('cache-control') || 'public, max-age=86400'
  );
  reply.send(buf);
}
