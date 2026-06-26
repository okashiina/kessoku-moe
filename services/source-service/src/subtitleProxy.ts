import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { isFetchUrlSafe } from './ssrfGuard.js';

// Generic provider-subtitle proxy. Soft-sub providers return external VTT URLs;
// serving them from our origin avoids browser CORS surprises in <track>.
export async function handleTrack(req: FastifyRequest, reply: FastifyReply): Promise<void> {
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
  let refHeaders: Record<string, string> = {};
  if (referer) {
    try {
      refHeaders = { Referer: referer, Origin: new URL(referer).origin };
    } catch {
      refHeaders = { Referer: referer };
    }
  }

  const upstream = await fetch(url, {
    headers: { 'User-Agent': config.userAgent, ...refHeaders },
  });
  if (!upstream.ok) {
    reply.code(upstream.status || 502).send({ error: `upstream ${upstream.status}` });
    return;
  }

  const text = await upstream.text();
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Cache-Control', 'public, max-age=86400');
  reply.type('text/vtt; charset=utf-8').send(text);
}