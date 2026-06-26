import type { Provider } from '../types.js';
import { config } from '../config.js';
import { allanime } from './allanime.js';
import { animepahe } from './animepahe.js';
import { aniliberty } from './aniliberty.js';
import { hianime } from './hianime.js';
import { kaa } from './kaa.js';

const registry: Record<string, Provider> = {
  [kaa.id]: kaa,
  [allanime.id]: allanime,
  [animepahe.id]: animepahe,
  [aniliberty.id]: aniliberty,
  [hianime.id]: hianime,
};

export const providerIds = Object.keys(registry);
export const publicProviderIds = providerIds.filter((id) => id !== 'aniliberty');

export function getProvider(id: string | undefined): Provider | undefined {
  return id ? registry[id] : undefined;
}

// Providers in the configured priority order (unknown ids are ignored).
export const orderedProviders: Provider[] = config.providers
  .map((id) => registry[id])
  .filter((p): p is Provider => Boolean(p));
