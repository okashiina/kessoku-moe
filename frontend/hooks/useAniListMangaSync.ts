import { useEffect, useRef } from 'react';

import { getSession, subscribeAuth } from '@utility/anilistAuth';
import {
  initMangaBaseline,
  isApplyingMangaRemote,
  noteMangaLocalChange,
  pullMangaAndMerge,
  pushMangaChanges,
} from '@utility/anilistMangaSync';
import { getAniListWrite, subscribeAniListWrite } from '@utility/anilistWrite';
import { subscribeMangaList } from '@utility/mangaList';
import { subscribeMangaProgress } from '@utility/mangaProgress';

const PUSH_DEBOUNCE_MS = 800;

// App-wide two-way MANGA sync driver. It pulls once after login, then debounces
// real local changes back to AniList. Remote-applied store writes are guarded so
// they cannot immediately cause a false local push.
const useAniListMangaSync = (): void => {
  const pulledFor = useRef<number | null>(null);

  useEffect(() => {
    // SSR guard: stores read localStorage, so only run in the browser.
    if (typeof window === 'undefined') return undefined;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const flush = () => {
      const s = getSession();
      if (s && getAniListWrite() && !isApplyingMangaRemote()) {
        pushMangaChanges(s).catch(() => {
          /* best-effort */
        });
      }
    };

    const onLocalChange = () => {
      // Record first, including while logged out, so a refresh cannot lose a
      // local intent before the next authenticated flush.
      noteMangaLocalChange();
      if (!getSession() || isApplyingMangaRemote()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, PUSH_DEBOUNCE_MS);
    };

    const maybePull = () => {
      const s = getSession();
      if (!s) {
        pulledFor.current = null;
        return;
      }
      if (pulledFor.current !== s.user.id) {
        pulledFor.current = s.user.id;
        // Pulls remain available in read-only mode; only the subsequent write
        // flush honours the user's AniList write setting.
        pullMangaAndMerge(s)
          .then((pulled) => (pulled ? pushMangaChanges(s) : undefined))
          .catch(() => {
            /* best-effort */
          });
      }
    };

    // When the viewer re-enables writing, flush progress that built up while off.
    const onWriteToggle = () => {
      if (getAniListWrite()) flush();
    };

    initMangaBaseline();
    maybePull();

    const unsubAuth = subscribeAuth(maybePull);
    const unsubProgress = subscribeMangaProgress(onLocalChange);
    const unsubShelf = subscribeMangaList(onLocalChange);
    const unsubWrite = subscribeAniListWrite(onWriteToggle);

    return () => {
      if (timer) clearTimeout(timer);
      unsubAuth();
      unsubProgress();
      unsubShelf();
      unsubWrite();
    };
  }, []);
};

export default useAniListMangaSync;
