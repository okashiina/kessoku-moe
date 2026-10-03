import type { CartoonShow } from './cartoon';
import { createStore } from './externalStore';

interface CartoonProgressEntry {
  id: number;
  title: string;
  cover: string | null;
  season: number;
  episode: number;
  updatedAt: number;
}

// Embeds cannot report playback position; remember the selected episode only.
const store = createStore<Record<number, CartoonProgressEntry>>(
  'kessoku.cartoonProgress.v1',
  {}
);
export const subscribeCartoonProgress = store.subscribe;
export const CARTOON_CONTINUE_EMPTY: CartoonProgressEntry[] = [];

export function getCartoonProgress(
  id: number
): CartoonProgressEntry | undefined {
  return store.get()[id];
}

export function saveCartoonEpisode(
  show: CartoonShow,
  season: number,
  episode: number
): void {
  store.update((prev) => ({
    ...prev,
    [show.id]: {
      id: show.id,
      title: show.name,
      cover: show.image?.medium || null,
      season,
      episode,
      updatedAt: Date.now(),
    },
  }));
}

export function removeCartoonContinue(id: number): void {
  store.update((prev) => {
    const next = { ...prev };
    delete next[id];
    return next;
  });
}

let lastMap: ReturnType<typeof store.get> | undefined;
let lastList = CARTOON_CONTINUE_EMPTY;
export function listCartoonContinue(): CartoonProgressEntry[] {
  const map = store.get();
  if (map !== lastMap) {
    lastMap = map;
    lastList = Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  return lastList;
}
