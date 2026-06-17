import type { NextApiRequest } from 'next';

// Write rate limiting for the push endpoints (Rule 8). Three tiers: per-IP,
// per-owner (the server-resolved viewer or device), and a global ceiling. Pure
// refill (no param mutation), consume from all tiers only when all pass (no
// double penalty). Process-memory store — the app is a single Railway instance;
// move the buckets to Redis for a multi-replica deploy (call sites unchanged).

interface Bucket {
  tokens: number;
  last: number;
}

const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

const IP_BURST = num(process.env.PUSH_IP_BURST, 20);
const IP_RPM = num(process.env.PUSH_IP_RPM, 30);
const OWNER_BURST = num(process.env.PUSH_OWNER_BURST, 20);
const OWNER_RPM = num(process.env.PUSH_OWNER_RPM, 30);
const GLOBAL_BURST = num(process.env.PUSH_GLOBAL_BURST, 100);
const GLOBAL_RPM = num(process.env.PUSH_GLOBAL_RPM, 120);

const ipBuckets = new Map<string, Bucket>();
const ownerBuckets = new Map<string, Bucket>();
const globalBucket: Bucket = { tokens: GLOBAL_BURST, last: Date.now() };
let lastSweep = Date.now();

// Token count after refilling by elapsed time. Pure: does NOT consume or mutate.
const refilled = (b: Bucket, burst: number, rpm: number, now: number): number =>
  Math.min(burst, b.tokens + ((now - b.last) / 60000) * rpm);

const getOrInit = (
  m: Map<string, Bucket>,
  key: string,
  burst: number,
  now: number
): Bucket => {
  let b = m.get(key);
  if (!b) {
    b = { tokens: burst, last: now };
    m.set(key, b);
  }
  return b;
};

// Evict idle per-IP / per-owner buckets so the maps can't grow unbounded.
const sweep = (now: number): void => {
  if (now - lastSweep < 5 * 60_000) return;
  lastSweep = now;
  const drop = (m: Map<string, Bucket>): void => {
    const stale: string[] = [];
    m.forEach((b, k) => {
      if (now - b.last > 10 * 60_000) stale.push(k);
    });
    stale.forEach((k) => m.delete(k));
  };
  drop(ipBuckets);
  drop(ownerBuckets);
};

export interface RateResult {
  ok: boolean;
  reason?: 'ip' | 'owner' | 'global';
  retryAfter?: number;
}

export const checkWriteRate = (ip: string, owner: string): RateResult => {
  const now = Date.now();
  sweep(now);

  const ipB = getOrInit(ipBuckets, ip, IP_BURST, now);
  ipB.tokens = refilled(ipB, IP_BURST, IP_RPM, now);
  ipB.last = now;
  const ownerB = getOrInit(ownerBuckets, owner, OWNER_BURST, now);
  ownerB.tokens = refilled(ownerB, OWNER_BURST, OWNER_RPM, now);
  ownerB.last = now;
  globalBucket.tokens = refilled(globalBucket, GLOBAL_BURST, GLOBAL_RPM, now);
  globalBucket.last = now;

  if (ipB.tokens < 1) {
    return { ok: false, reason: 'ip', retryAfter: Math.ceil(60 / IP_RPM) };
  }
  if (ownerB.tokens < 1) {
    return {
      ok: false,
      reason: 'owner',
      retryAfter: Math.ceil(60 / OWNER_RPM),
    };
  }
  if (globalBucket.tokens < 1) {
    return {
      ok: false,
      reason: 'global',
      retryAfter: Math.ceil(60 / GLOBAL_RPM),
    };
  }

  ipB.tokens -= 1;
  ownerB.tokens -= 1;
  globalBucket.tokens -= 1;
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
