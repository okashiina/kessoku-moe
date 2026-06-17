import { useEffect, useRef } from 'react';

import { getSession, subscribeAuth } from '@utility/anilistAuth';
import {
  initLocalBaseline,
  isApplyingRemote,
  noteLocalChange,
  pullAndMerge,
  pushChanges,
} from '@utility/anilistSync';
import { getAniListWrite, subscribeAniListWrite } from '@utility/anilistWrite';
import { subscribeScore } from '@utility/listScore';
import { subscribeStatus } from '@utility/listStatus';
import { subscribeProgress } from '@utility/progress';
import { subscribeWatchlist } from '@utility/watchlist';

const PUSH_DEBOUNCE_MS = 800;

// App-wide AniList sync driver, mounted once in _app. On login it pulls the
// user's list and merges it locally; thereafter it debounce-pushes local
// watchlist / progress changes back up. Entirely best-effort and no-op when
// logged out.
const useAniListSync = (): void => {
  const pulledFor = useRef<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Pull once per logged-in user (re-runs if the session changes).
    const maybePull = () => {
      const s = getSession();
      if (!s) {
        pulledFor.current = null;
        return;
      }
      if (pulledFor.current !== s.user.id) {
        pulledFor.current = s.user.id;
        // After importing, flush any local changes left un-pushed from a prior
        // session (tombstones / dirty statuses persisted across the refresh).
        pullAndMerge(s)
          .then(() => pushChanges(s))
          .catch(() => {
            /* best-effort */
          });
      }
    };

    const onLocalChange = () => {
      if (!getSession()) return;
      // Record the user's edit synchronously (persisted) so it survives a
      // refresh even if the network push below never fires. Skipped internally
      // while a remote pull is applying its own writes.
      noteLocalChange();
      if (isApplyingRemote()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const s = getSession();
        if (s && !isApplyingRemote()) {
          pushChanges(s).catch(() => {
            /* best-effort */
          });
        }
      }, PUSH_DEBOUNCE_MS);
    };

    // When the viewer re-enables writing, flush whatever local intent built up
    // while it was off (pushChanges itself no-ops while read-only).
    const onWriteToggle = () => {
      if (!getAniListWrite()) return;
      const s = getSession();
      if (s && !isApplyingRemote()) {
        pushChanges(s).catch(() => {
          /* best-effort */
        });
      }
    };

    initLocalBaseline();
    maybePull();
    const unsubAuth = subscribeAuth(maybePull);
    const unsubProgress = subscribeProgress(onLocalChange);
    const unsubWatchlist = subscribeWatchlist(onLocalChange);
    const unsubStatus = subscribeStatus(onLocalChange);
    const unsubScore = subscribeScore(onLocalChange);
    const unsubWrite = subscribeAniListWrite(onWriteToggle);

    return () => {
      if (timer) clearTimeout(timer);
      unsubAuth();
      unsubProgress();
      unsubWatchlist();
      unsubStatus();
      unsubScore();
      unsubWrite();
    };
  }, []);
};

export default useAniListSync;
