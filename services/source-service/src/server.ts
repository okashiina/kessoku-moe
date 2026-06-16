import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { resolve } from './resolver.js';
import { handleHls } from './hlsProxy.js';
import { handleFile } from './fileProxy.js';
import { watchRateLimit } from './rateLimit.js';
import { snapshot } from './circuitBreaker.js';
import { orderedProviders } from './providers/index.js';
import {
  resolveSubtitleTracks,
  fetchSubtitleVtt,
} from './subtitles/index.js';
import type { Category, WatchParams } from './types.js';

const app = Fastify({ logger: true });
await app.register(cors, {
  origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
});

const startedAt = Date.now();
app.log.info({ flaresolverr: config.flaresolverrUrl, providers: config.providers }, 'config');

app.get('/health', async () => ({ ok: true }));

// Observability (SOP #9) + per-provider breaker state (SOP #4 status surface).
app.get('/status', async () => ({
  ok: true,
  uptimeMs: Date.now() - startedAt,
  providers: orderedProviders.map((p) => p.id),
  breakers: snapshot(),
}));

// Main endpoint the frontend calls. Returns either a directly-playable result
// (sources proxied through /hls) or { mode: 'embed' } so the frontend uses its
// existing embed switcher as the fallback (SOP #2).
app.get('/watch', { preHandler: watchRateLimit }, async (req) => {
  const q = req.query as Record<string, string>;
  const anilistId = Number(q.anilistId);
  const episode = Number(q.episode);
  const category: Category = q.category === 'dub' ? 'dub' : 'sub';
  const titles = (q.titles || '').split(',').map((t) => t.trim()).filter(Boolean);

  if (!anilistId || !episode) {
    return { mode: 'embed', reason: 'missing anilistId/episode' };
  }

  const params: WatchParams = { anilistId, episode, category, titles };
  // Optional forced provider (frontend "Server" picker): resolve only that one so the
  // user can test e.g. AllAnime directly. Unknown/absent => normal fallback chain.
  const only = ['animepahe', 'allanime'].includes(q.provider) ? q.provider : undefined;
  // Resolve sources and external subtitle tracks together — subtitle lookup is
  // independent of the video source, so it adds no latency and degrades to [].
  const [result, subTracks] = await Promise.all([
    resolve(params, only),
    resolveSubtitleTracks(params).catch(() => []),
  ]);
  if (!result) return { mode: 'embed' };

  // Rewrite each source through our HLS proxy so the browser can play it.
  // Behind a TLS-terminating tunnel req.protocol is http; prefer an explicit
  // PUBLIC_BASE_URL, then X-Forwarded-Proto, so links stay https and the browser
  // doesn't block them as mixed content.
  const xfProto = req.headers['x-forwarded-proto'];
  const proto =
    typeof xfProto === 'string' && xfProto
      ? xfProto.split(',')[0].trim()
      : req.protocol;
  const base = config.publicBaseUrl || `${proto}://${req.headers.host}`;
  const sources = result.sources.map((s) => {
    const ref = s.headers?.Referer || result.headers?.Referer || '';
    let proxied: string;
    if (s.isM3U8) {
      proxied = `${base}/hls?url=${encodeURIComponent(s.url)}&ref=${encodeURIComponent(ref)}`;
    } else if (ref) {
      // Direct file (e.g. AllAnime's Referer-gated fast4speed MP4): proxy it so we
      // can attach the Referer and forward Range requests for seeking.
      proxied = `${base}/file?url=${encodeURIComponent(s.url)}&ref=${encodeURIComponent(ref)}`;
    } else {
      proxied = s.url;
    }
    return { ...s, url: proxied };
  });

  // Provider subtitles (e.g. a soft-sub stream's English VTT) plus our external
  // tracks (Indonesian via subdl, Japanese via Jimaku), served through /subs so
  // the file is fetched + converted to VTT lazily and from our own origin.
  const external = subTracks.map((t) => ({
    lang: t.lang,
    label: t.label,
    url:
      `${base}/subs?src=${t.source}` +
      `&ref=${encodeURIComponent(t.ref)}`,
  }));
  const subtitles = [...result.subtitles, ...external];

  return { mode: 'direct', provider: result.provider, sources, subtitles };
});

app.get('/hls', handleHls);
app.get('/file', handleFile);

// Subtitles (Phase 3): fetch the upstream file (subdl zip / Jimaku file), convert
// to WebVTT, and serve from our own domain. `ref` is host-restricted (SSRF guard).
app.get('/subs', async (req, reply) => {
  const q = req.query as Record<string, string>;
  const ref = q.ref || '';
  const source = ['jimaku', 'mt-id'].includes(q.src) ? q.src : 'subdl';
  if (!ref) return reply.code(400).send({ error: 'missing ref' });

  const vtt = await fetchSubtitleVtt(source, ref);
  if (!vtt) return reply.code(404).send({ error: 'subtitle unavailable' });

  reply.header('Cache-Control', 'public, max-age=86400');
  return reply.type('text/vtt; charset=utf-8').send(vtt);
});

app
  .listen({ port: config.port, host: '0.0.0.0' })
  .then((addr) => app.log.info(`source-service listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
