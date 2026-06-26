import type { ResolveResult, WatchParams } from './types.js';
import { getProvider, orderedProviders } from './providers/index.js';
import { isOpen, recordFailure, recordSuccess } from './circuitBreaker.js';
import { sourceCache, sourceKey } from './cache.js';
import { config } from './config.js';

// Fallback chain (SOP #1 + #2): try providers in priority order, skipping any with
// an open breaker. First playable result wins and is cached. If none succeed the
// caller serves embed fallback so the site never goes dark.
// `only` forces a single provider (the frontend's "Server: AnimePahe/AllAnime" pick),
// so the user can test one directly instead of getting the chain's first hit.
export async function resolve(
  params: WatchParams,
  only?: string
): Promise<ResolveResult | null> {
  const key =
    sourceKey(params.anilistId, params.episode, params.category) +
    (only ? `:${only}` : '');
  const cached = sourceCache.get(key);
  if (cached) return cached;

  const forced = getProvider(only);
  const providers = only ? (forced ? [forced] : []) : orderedProviders;
  for (const provider of providers) {
    if (isOpen(provider.id)) continue;
    try {
      const result = await provider.resolve(params);
      if (result && result.sources.length > 0) {
        recordSuccess(provider.id);
        sourceCache.set(key, result);
        return result;
      }
      // "no source" is not a hard failure; just try the next provider.
      // eslint-disable-next-line no-console
      else console.warn(`[resolver] ${provider.id}: no sources`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(`[resolver] ${provider.id} failed:`, message);
      const hardBlocked = /captcha|blocked|cloudflare/i.test(message);
      recordFailure(provider.id, hardBlocked ? config.breakerThreshold : 1);
    }
  }
  return null;
}
