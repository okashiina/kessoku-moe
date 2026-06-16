import type { NextApiRequest } from 'next';

// Rate limiting + daily cost cap for the AI companion endpoint (Rule 8 /
// STREAMING-ROADMAP §13 wall 2). The free upstream tiers are SHARED across every
// user (Gemini ~15 RPM·1500/day, Groq ~30 RPM·1000/day) and one chat turn fans
// out to ~2 upstream calls, so an unguarded endpoint lets one chatty user — or
// one abuser — drain the whole app's quota. Three tiers: per-IP, global, daily.
//
// Store: process memory. The app runs as a single Railway instance, so this is
// the shared store. For a multi-replica deploy move the buckets + daily counter
// to Redis (the call sites here do not change). See the roadmap §13.

const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

// Per-IP tier: a small burst + steady refill so one viewer chats naturally but
// can't hog the shared budget by spamming.
const IP_BURST = num(process.env.COMPANION_IP_BURST, 5);
const IP_RPM = num(process.env.COMPANION_IP_RPM, 8); // sustained turns/min/IP

// Global tier: total throughput across everyone. One turn is ~2 upstream calls,
// so the default (8 turns/min ~= 16 calls/min) stays under Groq's 30 RPM with the
// active default provider. On Gemini (15 RPM) lower COMPANION_GLOBAL_RPM via env.
const GLOBAL_BURST = num(process.env.COMPANION_GLOBAL_BURST, 10);
const GLOBAL_RPM = num(process.env.COMPANION_GLOBAL_RPM, 8); // sustained turns/min

// Daily budget: a hard ceiling on turns/day, well under the provider free caps
// (~2 upstream calls/turn → 500 turns ≈ 1000 calls, under both). Resets at UTC midnight.
const DAILY_MAX = num(process.env.COMPANION_DAILY_MAX, 500);

interface Bucket {
  tokens: number;
  last: number;
}

const ipBuckets = new Map<string, Bucket>();
const globalBucket: Bucket = { tokens: GLOBAL_BURST, last: Date.now() };

let day = '';
let dayCount = 0;
let lastSweep = Date.now();

// Token count after refilling a bucket by elapsed time. Pure: does NOT consume
// and does NOT mutate the bucket — the caller assigns, so this never reassigns a
// parameter's property.
const refilledTokens = (
  b: Bucket,
  burst: number,
  refillPerMin: number,
  now: number
): number =>
  Math.min(burst, b.tokens + ((now - b.last) / 60000) * refillPerMin);

// Evict idle per-IP buckets so the map can't grow unbounded (cleanup expired).
const sweep = (now: number): void => {
  if (now - lastSweep < 5 * 60_000) return;
  lastSweep = now;
  const stale: string[] = [];
  ipBuckets.forEach((b, ip) => {
    if (now - b.last > 10 * 60_000) stale.push(ip);
  });
  stale.forEach((ip) => ipBuckets.delete(ip));
};

const secondsToUtcMidnight = (now: number): number => {
  const d = new Date(now);
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1
  );
  return Math.max(1, Math.ceil((next - now) / 1000));
};

export interface RateResult {
  ok: boolean;
  reason?: 'ip' | 'global' | 'daily';
  retryAfter?: number; // seconds the client should wait before retrying
}

export const checkCompanionRate = (ip: string): RateResult => {
  const now = Date.now();
  sweep(now);

  // Daily budget first — the hard cost ceiling for the day.
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= DAILY_MAX) {
    return {
      ok: false,
      reason: 'daily',
      retryAfter: secondsToUtcMidnight(now),
    };
  }

  // Per-IP + global tiers. Refill both, then consume from BOTH only when both
  // have a token — so a turn the global cap rejects does NOT also burn the user's
  // per-IP token (no double penalty under load).
  let b = ipBuckets.get(ip);
  if (!b) {
    b = { tokens: IP_BURST, last: now };
    ipBuckets.set(ip, b);
  }
  b.tokens = refilledTokens(b, IP_BURST, IP_RPM, now);
  b.last = now;
  globalBucket.tokens = refilledTokens(
    globalBucket,
    GLOBAL_BURST,
    GLOBAL_RPM,
    now
  );
  globalBucket.last = now;
  if (b.tokens < 1) {
    return { ok: false, reason: 'ip', retryAfter: Math.ceil(60 / IP_RPM) };
  }
  if (globalBucket.tokens < 1) {
    return {
      ok: false,
      reason: 'global',
      retryAfter: Math.ceil(60 / GLOBAL_RPM),
    };
  }
  b.tokens -= 1;
  globalBucket.tokens -= 1;

  // Passed every tier — count it against today's budget.
  dayCount += 1;
  return { ok: true };
};

// Best-effort client IP. Behind Railway's proxy the real client is the first
// X-Forwarded-For hop; fall back to the socket address.
export const clientIp = (req: NextApiRequest): string => {
  const xff = req.headers['x-forwarded-for'];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  const ip = (raw || '').split(',')[0].trim();
  return ip || req.socket?.remoteAddress || 'unknown';
};
