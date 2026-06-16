import type { FastifyReply, FastifyRequest } from 'fastify';

// Global rate limit for the scrape fan-out (/watch). Resolving a title hits the
// providers + FlareSolverr (a ~45s CF cold-start), so a flood means faster
// CF/DDoS-Guard bans and a hammered box (STREAMING-ROADMAP §13 wall 3 / Rule 8).
//
// This is a GLOBAL cap, not per-IP, on purpose: the service sits behind a tunnel
// (Tailscale Funnel / Cloudflare) that does not hand us a reliable per-client IP,
// and any X-Forwarded-For is client-spoofable — so a per-IP bucket would either
// false-throttle everyone (all requests collapse into one bucket) or be trivially
// bypassed by rotating a forged header. A global ceiling protects the box + the
// providers regardless of source IP. The proxy/cache routes (/hls, /file, /subs)
// are deliberately NOT limited — they fire many times per playback and throttling
// them would stutter the video.
//
// Store: process memory (single box). Move to Redis if this ever runs
// multi-instance — the call site (a /watch preHandler) does not change.

const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const BURST = num(process.env.SOURCE_WATCH_BURST, 12); // global burst (resolves)
const RPM = num(process.env.SOURCE_WATCH_RPM, 20); // global sustained resolves/min

const bucket = { tokens: BURST, last: Date.now() };

// Fastify preHandler: drain one token for a /watch resolve, or reply 429 +
// Retry-After. Fails OPEN — a limiter bug must never block resolving a video.
export const watchRateLimit = async (
  _req: FastifyRequest,
  reply: FastifyReply
): Promise<FastifyReply | void> => {
  try {
    const now = Date.now();
    bucket.tokens = Math.min(
      BURST,
      bucket.tokens + ((now - bucket.last) / 60000) * RPM
    );
    bucket.last = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return; // allowed — fall through to the handler
    }
    const retryAfter = Math.ceil(60 / RPM);
    return reply
      .code(429)
      .header('Retry-After', String(retryAfter))
      .send({ error: 'rate_limited', retryAfter });
  } catch {
    // Fail open: never let a guard bug stop playback resolution.
    return undefined;
  }
};
