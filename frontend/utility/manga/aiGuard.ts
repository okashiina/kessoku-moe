import { clientIp } from '@utility/companion/rateLimit';

// Rule 8: rate limit + daily cost cap for the manga AI endpoints — the reading
// companion text turns (kind 'chat') and page-aware turns (kind 'vision').
// Page-aware chat sends the current manga page with the message, so it gets a
// tighter budget. Both remain separate from the anime companion's quota.

// Re-export so a route imports both the guard and the IP helper from one place.
export { clientIp };

export type AiKind = 'chat' | 'vision';

const num = (v: string | undefined, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

interface KindLimits {
  ipBurst: number;
  ipRpm: number;
  globalBurst: number;
  globalRpm: number;
  dailyMax: number;
}

const LIMITS: Record<AiKind, KindLimits> = {
  // Text chat: same shape as the anime companion (one turn ≈ 1-2 upstream calls).
  chat: {
    ipBurst: num(process.env.MANGA_AI_IP_BURST, 5),
    ipRpm: num(process.env.MANGA_AI_IP_RPM, 8),
    globalBurst: num(process.env.MANGA_AI_GLOBAL_BURST, 10),
    globalRpm: num(process.env.MANGA_AI_GLOBAL_RPM, 8),
    dailyMax: num(process.env.MANGA_AI_DAILY_MAX, 500),
  },
  // Vision: an image rides every request, so it is the pricier path — tighter
  // per-IP burst and a much lower daily ceiling than chat.
  vision: {
    ipBurst: num(process.env.MANGA_VISION_IP_BURST, 3),
    ipRpm: num(process.env.MANGA_VISION_IP_RPM, 4),
    globalBurst: num(process.env.MANGA_VISION_GLOBAL_BURST, 6),
    globalRpm: num(process.env.MANGA_VISION_GLOBAL_RPM, 5),
    dailyMax: num(process.env.MANGA_VISION_DAILY_MAX, 200),
  },
};

interface Bucket {
  tokens: number;
  last: number;
}

interface KindState {
  ipBuckets: Map<string, Bucket>;
  globalBucket: Bucket;
  day: string;
  dayCount: number;
}

const now0 = Date.now();
const state: Record<AiKind, KindState> = {
  chat: {
    ipBuckets: new Map(),
    globalBucket: { tokens: LIMITS.chat.globalBurst, last: now0 },
    day: '',
    dayCount: 0,
  },
  vision: {
    ipBuckets: new Map(),
    globalBucket: { tokens: LIMITS.vision.globalBurst, last: now0 },
    day: '',
    dayCount: 0,
  },
};

let lastSweep = Date.now();

// Token count after refilling by elapsed time. Pure: never mutates the bucket
// (the caller assigns), so it never reassigns a parameter's property.
const refilledTokens = (
  b: Bucket,
  burst: number,
  refillPerMin: number,
  now: number
): number =>
  Math.min(burst, b.tokens + ((now - b.last) / 60000) * refillPerMin);

// Evict idle per-IP buckets so the maps can't grow unbounded.
const sweep = (now: number): void => {
  if (now - lastSweep < 5 * 60_000) return;
  lastSweep = now;
  (Object.keys(state) as AiKind[]).forEach((k) => {
    const stale: string[] = [];
    state[k].ipBuckets.forEach((b, ip) => {
      if (now - b.last > 10 * 60_000) stale.push(ip);
    });
    stale.forEach((ip) => state[k].ipBuckets.delete(ip));
  });
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
  retryAfter?: number; // seconds to wait before retrying
}

export const checkMangaAi = (ip: string, kind: AiKind): RateResult => {
  const now = Date.now();
  sweep(now);
  const lim = LIMITS[kind];
  const st = state[kind];

  // Daily budget first — the hard cost ceiling for this kind, resets UTC midnight.
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== st.day) {
    st.day = today;
    st.dayCount = 0;
  }
  if (st.dayCount >= lim.dailyMax) {
    return {
      ok: false,
      reason: 'daily',
      retryAfter: secondsToUtcMidnight(now),
    };
  }

  // Per-IP + global tiers. Refill both, consume from both only when both have a
  // token (a turn the global cap rejects must not also burn the user's IP token).
  let b = st.ipBuckets.get(ip);
  if (!b) {
    b = { tokens: lim.ipBurst, last: now };
    st.ipBuckets.set(ip, b);
  }
  b.tokens = refilledTokens(b, lim.ipBurst, lim.ipRpm, now);
  b.last = now;
  st.globalBucket.tokens = refilledTokens(
    st.globalBucket,
    lim.globalBurst,
    lim.globalRpm,
    now
  );
  st.globalBucket.last = now;
  if (b.tokens < 1) {
    return { ok: false, reason: 'ip', retryAfter: Math.ceil(60 / lim.ipRpm) };
  }
  if (st.globalBucket.tokens < 1) {
    return {
      ok: false,
      reason: 'global',
      retryAfter: Math.ceil(60 / lim.globalRpm),
    };
  }
  b.tokens -= 1;
  st.globalBucket.tokens -= 1;
  st.dayCount += 1;
  return { ok: true };
};
