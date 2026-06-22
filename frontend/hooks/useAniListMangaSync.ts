import { useEffect } from 'react';

import { getSession, subscribeAuth } from '@utility/anilistAuth';
import { initMangaBaseline, pushMangaChanges } from '@utility/anilistMangaSync';
import { getAniListWrite, subscribeAniListWrite } from '@utility/anilistWrite';
import { subscribeMangaProgress } from '@utility/mangaProgress';

const PUSH_DEBOUNCE_MS = 800;

// App-wide AniList manga-progress sync driver, mounted once in _app right after
// useAniListSync. When the user marks chapters read it debounce-pushes the
// chapter count up as a MANGA entry. ponytail: PUSH-only (no pull) — see
// anilistMangaSync.ts. Entirely best-effort and no-op when logged out.
const useAniListMangaSync = (): void => {
  useEffect(() => {
    // SSR guard: stores read localStorage, so only run in the browser.
    if (typeof window === 'undefined') return undefined;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      const s = getSession();
      if (s && getAniListWrite()) {
        pushMangaChanges(s).catch(() => {
          /* best-effort */
        });
      }
    };

    const onLocalChange = () => {
      if (!getSession()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, PUSH_DEBOUNCE_MS);
    };

    // When the viewer re-enables writing, flush progress that built up while off.
    const onWriteToggle = () => {
      if (getAniListWrite()) flush();
    };

    initMangaBaseline();
    // Push once on mount/login too, in case progress advanced while logged out
    // or on a prior session (the baseline persists, so this is a cheap no-op
    // when nothing changed).
    flush();

    const unsubAuth = subscribeAuth(flush);
    const unsubProgress = subscribeMangaProgress(onLocalChange);
    const unsubWrite = subscribeAniListWrite(onWriteToggle);

    return () => {
      if (timer) clearTimeout(timer);
      unsubAuth();
      unsubProgress();
      unsubWrite();
    };
  }, []);
};

export default useAniListMangaSync;
