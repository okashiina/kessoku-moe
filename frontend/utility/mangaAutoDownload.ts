// Opt-in "auto-save the next chapter as you read" preference + the
// unmetered-connection check that gates it. Kept separate from mangaDownloads.ts
// so the download engine stays free of preference/connection concerns.
//
// The trigger lives in the reader (components/read/MangaReader.tsx): when this
// toggle is on and the connection is unmetered, reaching the end of a chapter
// pre-saves the next sibling for offline. That reuses the reader's `siblings`
// list, so no client-callable chapter-list API is needed.

import { createStore } from './externalStore';

const KEY = 'kessoku.mangaAutoDownload.v1';

interface AutoDownloadPrefs {
  enabled: boolean;
}

const store = createStore<AutoDownloadPrefs>(KEY, { enabled: false });
export const subscribeAutoDownload = store.subscribe;
export const AUTO_DOWNLOAD_DEFAULT: AutoDownloadPrefs = { enabled: false };

export function getAutoDownload(): AutoDownloadPrefs {
  return store.get();
}

export function setAutoDownloadEnabled(enabled: boolean): void {
  store.update((prev) => ({ ...prev, enabled }));
}

// True only when we can confidently say the connection is unmetered (wifi-like).
// Conservative by design: if the Network Information API is missing we return
// false (do nothing) rather than guess and burn someone's mobile data.
export function isUnmeteredConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (
    navigator as Navigator & {
      connection?: {
        type?: string;
        effectiveType?: string;
        saveData?: boolean;
      };
    }
  ).connection;
  if (!conn) return false; // API unavailable → don't guess.
  if (conn.saveData === true) return false; // user asked to save data.
  if (conn.type === 'wifi' || conn.type === 'ethernet') return true;
  if (conn.type === 'cellular') return false;
  // No explicit type (Chrome desktop): fall back to effectiveType. Treat slow
  // tiers as metered-ish and skip.
  const slow = ['slow-2g', '2g', '3g'];
  if (conn.effectiveType && slow.includes(conn.effectiveType)) return false;
  // 4g/unknown with no save-data and not cellular → treat as OK.
  return conn.effectiveType === '4g';
}
