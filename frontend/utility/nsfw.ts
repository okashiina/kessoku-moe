import { createStore } from './externalStore';

// NSFW (adult/mature) gate. Default OFF. Mirrored to BOTH localStorage (so the
// toggle is reactive in the client) AND a cookie (so SSR getServerSideProps can
// gate adult titles before render — AniList isAdult + MangaDex erotica/porn).
// After toggling, callers should refresh the current route so SSR re-runs.

const COOKIE = 'kessoku_nsfw';

const store = createStore<boolean>(
  'kessoku.nsfw.v1',
  false,
  (raw) => raw === '1',
  (v) => (v ? '1' : '0')
);

export const subscribeNsfw = store.subscribe;
export const getNsfwClient = (): boolean => store.get();

export function setNsfw(on: boolean): void {
  store.set(on);
  if (typeof document !== 'undefined') {
    document.cookie = `${COOKIE}=${
      on ? '1' : '0'
    }; path=/; max-age=31536000; samesite=lax`;
  }
}

/** SSR: read the NSFW pref from a raw Cookie header. */
export function nsfwFromCookie(cookieHeader?: string | null): boolean {
  if (!cookieHeader) return false;
  return new RegExp(`(?:^|;\\s*)${COOKIE}=1(?:;|$)`).test(cookieHeader);
}
