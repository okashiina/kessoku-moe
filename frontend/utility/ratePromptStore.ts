import { createStore } from './externalStore';

// Remembers when the "rate this show" prompt last surfaced per anime, so it
// never nags: once it shows (or is dismissed), it stays quiet for a cooldown.
// Rating the show suppresses it entirely (the hook checks the score). Persisted
// like the other prefs so the cooldown survives refreshes.

type SeenMap = Record<number, number>; // animeId -> last shown/dismissed (ms epoch)

const KEY = 'kessoku.rateprompt.v1';
const store = createStore<SeenMap>(KEY, {});

/** ms epoch the prompt was last shown/dismissed for this anime, or 0. */
export const getRatePromptSeen = (id: number): number => store.get()[id] ?? 0;

/** Start the cooldown for this anime (called when shown or dismissed). */
export const markRatePromptSeen = (id: number): void => {
  store.update((prev) => ({ ...prev, [id]: Date.now() }));
};
