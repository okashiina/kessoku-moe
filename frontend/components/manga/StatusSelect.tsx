import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  getMangaStatus,
  isMangaSaved,
  setMangaStatus,
  subscribeMangaList,
  toggleMangaSaved,
  type MangaEntryInfo,
  type MangaStatus,
} from '@utility/mangaList';

// Local reading-status picker for a manga series (Reading / Completed / Plan to
// read). Mirrors the anime StatusSelect — a pill trigger that opens a glass
// popover — but writes to the localStorage manga list only (no AniList wiring;
// a sibling feature owns sync). Setting a status materialises the saved entry so
// the series shows in the watchlist Manga tab. "Remove from list" un-bookmarks
// and clears the status.

const STATUS_OPTIONS: { value: MangaStatus; label: string }[] = [
  { value: 'READING', label: 'Reading' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PLAN_TO_READ', label: 'Plan to read' },
];

const statusLabel = (s: MangaStatus): string =>
  STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;

export interface MangaStatusSelectProps extends MangaEntryInfo {
  id: number;
}

const MangaStatusSelect: React.FC<MangaStatusSelectProps> = ({
  id,
  title,
  cover,
  country,
}) => {
  const status = useSyncExternalStore(
    subscribeMangaList,
    () => getMangaStatus(id),
    () => null
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const info: MangaEntryInfo = { title, cover, country };

  const choose = (value: MangaStatus) => {
    setMangaStatus(id, value, info);
    setOpen(false);
  };

  const remove = () => {
    setMangaStatus(id, null);
    if (isMangaSaved(id)) toggleMangaSaved({ id, title, cover, country });
    setOpen(false);
  };

  const onList = status !== null;
  const label = status ? statusLabel(status) : 'Set status';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ touchAction: 'manipulation' }}
        className={`flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
          onList
            ? 'border-accent/60 bg-aurora text-accent-ink shadow-glow'
            : 'border-line/70 bg-surface/70 text-fg hover:border-accent/60'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill={onList ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 19.5V6a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 17.5z" />
        </svg>
        {label}
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 transition motion-reduce:transition-none ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-48 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line/60 bg-canvas/95 shadow-lift ring-1 ring-line/40 backdrop-blur-xl"
        >
          {STATUS_OPTIONS.map((o) => {
            const active = status === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => choose(o.value)}
                style={{ touchAction: 'manipulation' }}
                className={`flex min-h-[44px] w-full items-center justify-between px-4 py-2 text-left text-sm transition hover:bg-surface/60 active:bg-surface/80 motion-reduce:transition-none ${
                  active ? 'text-accent' : 'text-fg'
                }`}
              >
                {o.label}
                {active && (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
          {onList && (
            <button
              type="button"
              onClick={remove}
              style={{ touchAction: 'manipulation' }}
              className="min-h-[44px] w-full border-t border-line/50 px-4 py-2 text-left text-sm text-muted transition hover:bg-surface/60 hover:text-fg active:bg-surface/80 motion-reduce:transition-none"
            >
              Remove from list
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MangaStatusSelect;
