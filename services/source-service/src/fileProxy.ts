import type { FastifyReply, FastifyRequest } from 'fastify';
import { Readable } from 'node:stream';
import { config } from './config.js';
import { isFetchUrlSafe } from './ssrfGuard.js';

// Media proxy for direct (non-HLS) files that are Referer/hotlink-gated — e.g.
// AllAnime's fast4speed CDN MP4s, which 404 without a Referer the browser can't
// set on a <video>. We forward the client's Range header (so seeking works), set
// the upstream Referer/Origin, and stream the body back (these files are large, so
// we never buffer the whole thing).
export async function handleFile(
  req: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
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
  const range = req.headers.range;

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: {
        'User-Agent': config.userAgent,
        ...(referer ? { Referer: referer, Origin: new URL(referer).origin } : {}),
        ...(range ? { Range: range } : {}),
      },
    });
  } catch {
    reply.code(502).send({ error: 'upstream fetch failed' });
    return;
  }

  if (upstream.status >= 400 || !upstream.body) {
    reply.code(upstream.status || 502).send({ error: `upstream ${upstream.status}` });
    return;
  }

  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Accept-Ranges', 'bytes');
  for (const h of ['content-type', 'content-length', 'content-range']) {
    const v = upstream.headers.get(h);
    if (v) reply.header(h, v);
  }
  // Cache policy by response kind (STREAMING-ROADMAP §13 wall 1). We set it
  // ourselves rather than forwarding the upstream's, so a partial can never be
  // marked shared-cacheable:
  // - full file (200): public, so a CDN/edge can offload repeats off this box.
  // - partial (206): private — the browser may cache the range for seeks, but a
  //   shared CDN must NOT (its key is the bare ?url= with no Vary: Range, so it
  //   could serve one viewer's byte-range to another's request and corrupt seeks).
  if (upstream.status === 206) {
    reply.header('Cache-Control', 'private, max-age=86400');
  } else {
    reply.header(
      'Cache-Control',
      upstream.headers.get('cache-control') || 'public, max-age=86400'
    );
  }
  reply.code(upstream.status); // 200 (full) or 206 (partial, when Range was honoured)

  // Stream the web ReadableStream as a Node stream. Fastify pipes it and handles
  // client disconnects (it destroys the stream), so a viewer seeking/closing won't
  // leak the upstream connection.
  await reply.send(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]));
}
