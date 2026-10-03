import { useEffect, useRef, useState } from 'react';

import useEffectiveStatus from '@hooks/useEffectiveStatus';
import {
  clearExplicitStatus,
  setExplicitStatus,
  statusLabel,
  STATUS_OPTIONS,
  type AniStatus,
} from '@utility/listStatus';
import { removeFromWatchlist } from '@utility/watchlist';

// Explicit list-status picker (Watching / Plan to Watch / Completed / On Hold /
// Dropped). Sets a status that syncs straight to AniList; "Remove from list"
// clears it and un-bookmarks. Mirrors the AniList list-entry status.
const StatusSelect: React.FC<{ id: number }> = ({ id }) => {
  const status = useEffectiveStatus(id);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const choose = (value: AniStatus) => {
    setExplicitStatus(id, value);
    setOpen(false);
  };

  const remove = () => {
    removeFromWatchlist(id);
    clearExplicitStatus(id);
    setOpen(false);
  };

  const onList = status !== null;
  const label = status ? statusLabel(status) : 'Add to list';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex min-h-[44px] items-center gap-2 rounded-[5px] border px-4 text-sm font-bold transition active:scale-95 ${
          onList
            ? 'border-accent bg-accent text-accent-ink'
            : 'border-[#66516a] bg-surface/70 text-fg hover:text-accent'
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
          <path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1z" />
        </svg>
        {label}
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`}
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
          className="absolute left-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-lg border border-line bg-canvas/95 backdrop-blur-xl"
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
                className={`flex min-h-[44px] w-full items-center justify-between px-4 text-left text-sm transition hover:bg-surface/60 ${
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
              className="min-h-[44px] w-full border-t border-line px-4 text-left text-sm text-muted transition hover:bg-surface/60 hover:text-fg"
            >
              Remove from list
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default StatusSelect;
