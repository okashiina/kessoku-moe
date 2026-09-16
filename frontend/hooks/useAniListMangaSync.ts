import { useEffect, useRef } from 'react';

import { getSession, subscribeAuth } from '@utility/anilistAuth';
import {
  initMangaBaseline,
  isApplyingMangaRemote,
  isMangaSyncReady,
  noteMangaLocalChange,
  pullMangaAndMerge,
  pushMangaChanges,
} from '@utility/anilistMangaSync';
import { getAniListWrite, subscribeAniListWrite } from '@utility/anilistWrite';
import { subscribeMangaList } from '@utility/mangaList';
import {
  pullMangaPositions,
  pushMangaPositions,
} from '@utility/mangaPositionSync';
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
      if (s && isMangaSyncReady() && !isApplyingMangaRemote()) {
        // A successful exact-position pull is the gate for its writes. AniList
        // shelf sync remains healthy when our DB is not configured (503).
        pullMangaPositions(s)
          .then(async (positionsPulled) => {
            if (getAniListWrite()) await pushMangaChanges(s);
            if (positionsPulled) await pushMangaPositions(s);
          })
          .catch(() => {
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
          .then(async (pulled) => {
            if (!pulled) {
              pulledFor.current = null;
              return;
            }
            // Ordering is intentional: AniList ownership first, exact rows
            // second, then the AniList and exact local deltas respectively.
            const positionsPulled = await pullMangaPositions(s);
            await pushMangaChanges(s);
            if (positionsPulled) await pushMangaPositions(s);
          })
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
