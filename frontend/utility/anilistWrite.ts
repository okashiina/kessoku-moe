import { useSyncExternalStore } from 'react';

import { createStore } from './externalStore';

// Whether kessoku may WRITE to the signed-in viewer's AniList account, i.e. push
// their ratings, status, and progress (SaveMediaListEntry / DeleteMediaListEntry).
//
// AniList OAuth issues no read-only scope: every token is full-access, tied to
// the app registration. So this permission can't be enforced at the provider; we
// enforce it here in the app. When off, the sync stays PULL-ONLY and never sends
// a write, so the viewer's changes stay on this device. Local intent is still
// recorded (noteLocalChange), so flipping this back on flushes what built up.
//
// Default on, so existing sync keeps working untouched. Set at sign-in (the
// benefits modal) and changeable any time on the Settings page.

const KEY = 'kessoku.anilist.write.v1';
const fallback = true;

const store = createStore<boolean>(KEY, fallback);

export const getAniListWrite = (): boolean => store.get();
export const setAniListWrite = (allow: boolean): void => store.set(allow);
export const subscribeAniListWrite = store.subscribe;

// `fallback` is a stable reference so getServerSnapshot never trips the
// "getSnapshot should be cached" loop during SSR.
export const useAniListWrite = (): boolean =>
  useSyncExternalStore(store.subscribe, store.get, () => fallback);
