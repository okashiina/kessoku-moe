import { useRef, useState, useSyncExternalStore } from 'react';

import { DownloadIcon, XIcon } from '@heroicons/react/solid';

import type { ChapterLite } from '@components/manga/ChapterList';
import {
  downloadNext,
  isChapterDownloaded,
  type NextChapter,
  subscribeDownloads,
} from '@utility/mangaDownloads';
import { getReaderPrefs } from '@utility/readerPrefs';

// Bulk offline download from the series detail page: grab the whole series or a
// chapter range in one go. Reuses downloadNext (sequential, rate-friendly, skips
// already-saved chapters, drops a failed one instead of aborting the batch). An
// AbortController lets a long run stop between chapters.

interface Props {
  anilistId: number;
  chapters: ChapterLite[]; // ascending by chapterNum, for the current language
}

interface Progress {
  index: number;
  count: number;
  label?: string;
}

const CONFIRM_OVER = 20; // confirm before a large batch (data + storage + time)

const BulkDownload: React.FC<Props> = ({ anilistId, chapters }) => {
  const last = chapters.length - 1;
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(last);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Live count of how many of these chapters are already saved, so the header
  // and button reflect what's left.
  const savedCount = useSyncExternalStore(
    subscribeDownloads,
    () => chapters.reduce((n, c) => (isChapterDownloaded(c.id) ? n + 1 : n), 0),
    () => 0
  );

  if (chapters.length === 0) return null;

  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const inRange = chapters.slice(lo, hi + 1);
  const pending = inRange.filter((c) => !isChapterDownloaded(c.id)).length;
  const running = progress !== null;
  const fullRange = lo === 0 && hi === last;

  const run = async (): Promise<void> => {
    if (running || pending === 0) return;
    if (
      pending > CONFIRM_OVER &&
      !window.confirm(
        `Download ${pending} chapters for offline? This can use a lot of data and storage.`
      )
    ) {
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setResult(null);
    setProgress({ index: 0, count: pending });
    const items: NextChapter[] = inRange.map((c) => ({
      id: c.id,
      title: c.label,
      anilistId,
    }));
    try {
      const res = await downloadNext(
        items,
        getReaderPrefs().dataSaver,
        (p) => setProgress({ index: p.index, count: p.count, label: p.title }),
        controller.signal
      );
      setResult(
        controller.signal.aborted
          ? `Stopped. Saved ${res.saved} of ${res.attempted}.`
          : `Saved ${res.saved} of ${res.attempted} chapters for offline.`
      );
    } catch {
      setResult('Something interrupted the download. Try again.');
    } finally {
      setProgress(null);
      abortRef.current = null;
    }
  };

  let buttonLabel = `Download ${pending} chapter${pending === 1 ? '' : 's'}`;
  if (pending === 0) buttonLabel = 'All in range are saved';
  else if (fullRange) buttonLabel = `Download all (${pending})`;

  return (
    <div className="mb-4 rounded-2xl border border-line/50 bg-surface/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2.5 text-sm font-semibold text-fg transition [touch-action:manipulation] hover:text-accent active:text-accent"
      >
        <DownloadIcon className="h-5 w-5 text-accent" aria-hidden />
        Save for offline
        {savedCount > 0 && (
          <span className="text-xs font-medium text-muted">
            {savedCount}/{chapters.length} saved
          </span>
        )}
        <span className="ml-auto text-muted" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-line/40 px-4 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs text-muted">
              From chapter
              <select
                value={lo}
                onChange={(e) => setFrom(Number(e.target.value))}
                disabled={running}
                className="min-h-[44px] w-full rounded-xl border border-line/70 bg-surface/60 px-3 text-sm text-fg [touch-action:manipulation] focus:border-accent focus:outline-none disabled:opacity-50"
              >
                {chapters.map((c, i) => (
                  <option key={c.id} value={i}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[8rem] flex-1 flex-col gap-1 text-xs text-muted">
              To chapter
              <select
                value={hi}
                onChange={(e) => setTo(Number(e.target.value))}
                disabled={running}
                className="min-h-[44px] w-full rounded-xl border border-line/70 bg-surface/60 px-3 text-sm text-fg [touch-action:manipulation] focus:border-accent focus:outline-none disabled:opacity-50"
              >
                {chapters.map((c, i) => (
                  <option key={c.id} value={i}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {running ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <span className="min-w-0 truncate">
                  Saving {progress.index} of {progress.count}
                  {progress.label ? ` · ${progress.label}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border border-line/70 bg-surface/60 px-3 text-xs font-semibold text-fg [touch-action:manipulation] hover:border-rose-400/60 hover:text-rose-300 active:scale-95 motion-reduce:active:scale-100"
                >
                  <XIcon className="h-3.5 w-3.5" aria-hidden /> Stop
                </button>
              </div>
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-2"
                aria-hidden
              >
                <div
                  className="h-full rounded-full bg-aurora"
                  style={{
                    width: `${
                      progress.count
                        ? (progress.index / progress.count) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={run}
              disabled={pending === 0}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 self-start rounded-full bg-aurora px-5 text-sm font-semibold text-accent-ink shadow-glow transition [touch-action:manipulation] hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:active:scale-100"
            >
              <DownloadIcon className="h-4 w-4" aria-hidden />
              {buttonLabel}
            </button>
          )}

          {result && !running && <p className="text-xs text-muted">{result}</p>}
          <p className="text-xs text-muted">
            Saved chapters read with no connection. Big batches use more data
            and storage, and manhwatop titles need the relay machine awake while
            they download.
          </p>
        </div>
      )}
    </div>
  );
};

export default BulkDownload;
