import { useEffect, useState, useSyncExternalStore } from 'react';

import Link from 'next/link';

import {
  clearAll,
  deleteChapter,
  DOWNLOADS_EMPTY,
  downloadsSnapshot,
  subscribeDownloads,
} from '@utility/mangaDownloads';

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

const DownloadsManager: React.FC = () => {
  const downloads = useSyncExternalStore(
    subscribeDownloads,
    downloadsSnapshot,
    () => DOWNLOADS_EMPTY
  );
  const storage = useStorageEstimate();

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
      <div className="mx-4 flex flex-col items-center justify-center rounded-2xl border border-line/50 bg-surface/30 px-6 py-20 text-center sm:mx-6 lg:mx-8">
        <p className="font-display text-lg font-bold text-fg">
          Nothing saved for the road yet
        </p>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Open a chapter, tap the reader settings, and hit Download. It lands
          here, ready to read when the signal drops.
        </p>
        <Link href="/manga" passHref>
          <a className="mt-6 inline-flex min-h-[44px] items-center rounded-full bg-aurora px-5 py-2 text-sm font-semibold text-accent-ink shadow-glow transition [touch-action:manipulation] hover:brightness-110">
            Find something to read
          </a>
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/50 bg-surface/30 px-4 py-3">
        <div className="text-sm text-muted">
          <span className="font-semibold text-fg">{downloads.length}</span>{' '}
          {downloads.length === 1 ? 'chapter' : 'chapters'} saved
          {storage && (
            <>
              {' · '}
              <span className="text-fg">{storage}</span> approx app storage
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex min-h-[44px] items-center rounded-full border border-line/70 bg-surface/60 px-4 py-2 text-sm font-semibold text-fg transition [touch-action:manipulation] hover:border-rose-400/60 hover:text-rose-300 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          Clear all
        </button>
      </div>

      <ul className="flex flex-col gap-3">
        {downloads.map((d) => (
          <li
            key={d.chapterId}
            className="flex items-center justify-between gap-3 rounded-2xl border border-line/50 bg-surface/40 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-fg">
                {d.title || d.chapterId}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span>
                  {d.pageCount} {d.pageCount === 1 ? 'page' : 'pages'}
                </span>
                <span aria-hidden>·</span>
                <span>{fmtDate(d.savedAt)}</span>
                {d.partial && (
                  <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 font-medium text-amber-300">
                    Partial
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onDelete(d.chapterId, d.title || d.chapterId)}
              aria-label={`Delete ${d.title || d.chapterId}`}
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-full border border-line/70 bg-surface/60 px-4 py-2 text-sm font-semibold text-fg transition [touch-action:manipulation] hover:border-rose-400/60 hover:text-rose-300 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default DownloadsManager;
