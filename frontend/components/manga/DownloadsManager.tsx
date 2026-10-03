import { useEffect, useState, useSyncExternalStore } from 'react';

import Link from 'next/link';

import { ChevronRightIcon } from '@heroicons/react/solid';

import {
  getAutoDownload,
  setAutoDownloadEnabled,
  subscribeAutoDownload,
} from '@utility/mangaAutoDownload';
import {
  clearAll,
  deleteChapter,
  DOWNLOADS_EMPTY,
  downloadsSnapshot,
  ensurePersistentStorage,
  getPersistState,
  PersistState,
  readUrlFor,
  subscribeDownloads,
} from '@utility/mangaDownloads';

import styles from '../../styles/Browse.module.css';

const fmtDate = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

const fmtBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
};

// Approximate, app-wide. ponytail: navigator.storage.estimate() reports usage for
// ALL origin storage (caches, localStorage, IndexedDB), not just manga bytes, so
// we label it "approx app storage" rather than implying it's the exact download size.
const useStorageEstimate = (): string | null => {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (!nav?.storage?.estimate) return;
    nav.storage
      .estimate()
      .then((est) => {
        if (typeof est.usage === 'number') setLabel(fmtBytes(est.usage));
      })
      .catch(() => {});
  }, []);
  return label;
};

// Read current persistence and best-effort request it on mount, so opening this
// page nudges the browser to keep downloads around. Feature-gated; never crashes.
const usePersistState = (): PersistState => {
  const [state, setState] = useState<PersistState>('unsupported');
  useEffect(() => {
    let alive = true;
    ensurePersistentStorage()
      .then((s) => alive && setState(s))
      .catch(
        () => alive && getPersistState().then((s) => alive && setState(s))
      );
    return () => {
      alive = false;
    };
  }, []);
  return state;
};

const outlineBtn =
  'inline-flex min-h-[44px] items-center justify-center rounded-[5px] border border-[#66516a] px-4 text-sm font-bold text-[#f4ecef] transition [touch-action:manipulation] hover:border-[#7a6280] disabled:cursor-not-allowed disabled:opacity-50';

// Persistence status + the "auto-save on wifi" opt-in. Shown in both the empty
// and populated states so the controls are always reachable.
const StorageSettings: React.FC<{ persist: PersistState }> = ({ persist }) => {
  const auto = useSyncExternalStore(
    subscribeAutoDownload,
    () => getAutoDownload().enabled,
    () => false
  );
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-lg border border-[#463b49] px-4 py-3">
      {persist !== 'unsupported' && (
        <p className="text-xs text-[#bfb2c1]">
          Storage:{' '}
          {persist === 'persistent' ? (
            <span className="font-bold text-[#f4ecef]">persistent</span>
          ) : (
            <span className="font-bold text-[#f4ecef]">best-effort</span>
          )}
          <span className="ml-1">
            {persist === 'persistent'
              ? 'The browser is keeping your downloads.'
              : 'Downloads may be cleared if storage runs low.'}
          </span>
        </p>
      )}
      <label className="flex min-h-[44px] items-center justify-between gap-3">
        <span className="text-sm text-[#f4ecef]">
          Auto-save the next chapter as you read
          <span className="mt-0.5 block text-xs text-[#bfb2c1]">
            On wifi only, so the next one is ready offline.
          </span>
        </span>
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => setAutoDownloadEnabled(e.target.checked)}
          className="h-5 w-5 shrink-0 accent-accent [touch-action:manipulation]"
        />
      </label>
    </div>
  );
};

const DownloadsManager: React.FC = () => {
  const downloads = useSyncExternalStore(
    subscribeDownloads,
    downloadsSnapshot,
    () => DOWNLOADS_EMPTY
  );
  const storage = useStorageEstimate();
  const persist = usePersistState();

  const onDelete = (chapterId: string, title: string): void => {
    if (!window.confirm(`Remove "${title}" from downloads?`)) return;
    deleteChapter(chapterId).catch(() => {});
  };

  const onClearAll = (): void => {
    if (
      !window.confirm('Remove every downloaded chapter? This frees the space.')
    )
      return;
    clearAll().catch(() => {});
  };

  if (!downloads.length) {
    return (
      <>
        <StorageSettings persist={persist} />
        <div className={styles.empty}>
          <h2>Nothing saved yet</h2>
          <p>
            Save a chapter from the reader and it will show up here for offline
            reading.
          </p>
          <Link href="/manga" passHref>
            <a className="inline-flex min-h-[48px] items-center justify-center rounded-[5px] bg-accent px-5 text-sm font-bold text-accent-ink">
              Find something to read
            </a>
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <StorageSettings persist={persist} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#463b49] px-4 py-3">
        <div className="text-sm text-[#bfb2c1]">
          <span className="font-bold text-[#f4ecef]">{downloads.length}</span>{' '}
          {downloads.length === 1 ? 'chapter' : 'chapters'} saved
          {storage && (
            <>
              {' · '}
              <span className="text-[#f4ecef]">{storage}</span> approx app
              storage
            </>
          )}
        </div>
        <button type="button" onClick={onClearAll} className={outlineBtn}>
          Clear all
        </button>
      </div>

      <p className="mb-2 text-xs text-[#bfb2c1]">
        Tap a chapter to read it offline.
      </p>
      <ul className="flex flex-col gap-3">
        {downloads.map((d) => (
          <li
            key={d.chapterId}
            className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#463b49] pr-2"
          >
            {/* Plain <a> (full navigation), not a Next <Link>: a client-side nav
                fetches the page's data JSON, which isn't cached and fails offline.
                A full nav hits the SW, which serves the cached read-page HTML. */}
            <a
              href={d.readUrl || readUrlFor(d.chapterId, d.anilistId)}
              className="group flex min-h-[44px] min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-[#f4ecef] transition [touch-action:manipulation] hover:text-accent"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">
                  {d.title || d.chapterId}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#bfb2c1]">
                  <span>
                    {d.pageCount} {d.pageCount === 1 ? 'page' : 'pages'}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{fmtDate(d.savedAt)}</span>
                  {d.partial && (
                    <span className="rounded-[5px] border border-[#66516a] px-2 py-0.5 font-bold text-[#f4ecef]">
                      Partial
                    </span>
                  )}
                </span>
              </span>
              <ChevronRightIcon
                className="h-5 w-5 shrink-0 text-[#bfb2c1] transition group-hover:text-accent"
                aria-hidden
              />
            </a>
            <button
              type="button"
              onClick={() => onDelete(d.chapterId, d.title || d.chapterId)}
              aria-label={`Delete ${d.title || d.chapterId}`}
              className={outlineBtn}
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </>
  );
};

export default DownloadsManager;
