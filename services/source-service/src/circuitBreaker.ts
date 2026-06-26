import { config } from './config.js';

// Per-provider circuit breaker (SOP #3). After N failures within the window a
// provider is "open" (skipped) for a cooldown, then half-opened to retry once.
// Stops one dead provider from slowing every request.

type State = { failures: number; openedAt: number | null };

const states = new Map<string, State>();

const get = (key: string): State =>
  states.get(key) || states.set(key, { failures: 0, openedAt: null }).get(key)!;

export function isOpen(key: string): boolean {
  const s = get(key);
  if (s.openedAt === null) return false;
  if (Date.now() - s.openedAt >= config.breakerCooldownMs) {
    // half-open: allow one trial through
    s.openedAt = null;
    s.failures = config.breakerThreshold - 1;
    return false;
  }
  return true;
}

export function recordSuccess(key: string): void {
  states.set(key, { failures: 0, openedAt: null });
}

export function recordFailure(key: string, weight = 1): void {
  const s = get(key);
  s.failures += weight;
  if (s.failures >= config.breakerThreshold) s.openedAt = Date.now();
}

export function snapshot(): Record<string, { open: boolean; failures: number }> {
  const out: Record<string, { open: boolean; failures: number }> = {};
  for (const [k, s] of states) out[k] = { open: s.openedAt !== null, failures: s.failures };
  return out;
}
