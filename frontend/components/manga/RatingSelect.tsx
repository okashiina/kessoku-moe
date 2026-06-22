import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import {
  getMangaScore,
  setMangaScore,
  subscribeMangaList,
  type MangaEntryInfo,
} from '@utility/mangaList';

// Local personal-score control for a manga series. A pill trigger that opens a
// popover with a 1-10 button grid + a Clear action. Mirrors the anime
// RatingSelect's shell, but ponytail-simplified to a SINGLE control: a local
// score has no AniList scoreFormat to honour, so there's no stars/faces/slider
// branching — just 1-10. The value is stored as scoreRaw 0-100 (n * 10) so it
// stays AniList-compatible for a future sync.
// ponytail: single 1-10 grid only. Upgrade path = when AniList sync lands, read
// session.scoreFormat and swap in the anime RatingSelect's renderControl().

const Star: React.FC<{ filled: boolean }> = ({ filled }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-6 w-6"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.79L12 16.77l-5.2 2.73.99-5.79-4.21-4.1 5.82-.85z" />
  </svg>
);

export interface MangaRatingSelectProps extends MangaEntryInfo {
  id: number;
}

const MangaRatingSelect: React.FC<MangaRatingSelectProps> = ({
  id,
  title,
  cover,
  country,
}) => {
  const raw = useSyncExternalStore(
    subscribeMangaList,
    () => getMangaScore(id),
    () => 0
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
  const scored = raw > 0;
  const n = Math.round(raw / 10); // current value on the 1-10 scale

  // Tapping the value you already have clears it.
  const choose = (value: number) =>
    setMangaScore(id, n === value ? null : value * 10, info);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={scored ? `Your rating: ${n} of 10` : 'Rate'}
        style={{ touchAction: 'manipulation' }}
        className={`flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
          scored
            ? 'border-accent/60 bg-surface/70 text-fg hover:border-accent'
            : 'border-line/70 bg-surface/70 text-fg hover:border-accent/60'
        }`}
      >
        <span className={scored ? 'text-accent' : 'text-muted'}>
          <Star filled={scored} />
        </span>
        {scored ? n : 'Rate'}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-max max-w-[calc(100vw-2rem)] rounded-2xl border border-line/60 bg-canvas/95 p-4 shadow-lift ring-1 ring-line/40 backdrop-blur-xl"
        >
          <div className="mb-3 flex items-baseline justify-between gap-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">
              Your rating
            </p>
            <p className="text-[0.7rem] text-faint">out of 10</p>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => choose(v)}
                aria-label={`${v} of 10`}
                style={{ touchAction: 'manipulation' }}
                className={`flex h-11 min-h-[44px] w-11 items-center justify-center rounded-lg text-sm font-semibold transition active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                  v <= n
                    ? 'bg-aurora text-accent-ink shadow-glow'
                    : 'bg-surface/70 text-muted hover:text-fg'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {scored && (
            <button
              type="button"
              onClick={() => setMangaScore(id, null)}
              style={{ touchAction: 'manipulation' }}
              className="mt-3 min-h-[44px] w-full border-t border-line/50 pt-3 text-center text-xs text-muted transition hover:text-fg active:text-fg motion-reduce:transition-none"
            >
              Clear rating
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default MangaRatingSelect;
