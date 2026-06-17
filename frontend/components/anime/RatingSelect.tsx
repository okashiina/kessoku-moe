import { useEffect, useRef, useState } from 'react';

import useAniListAuth from '@hooks/useAniListAuth';
import { type ScoreFormat } from '@utility/anilistAuth';
import { clearScore, setScore, useScore } from '@utility/listScore';

// Personal rating control. Score is stored as scoreRaw (0-100); the control
// shown matches the viewer's AniList score format (stars / faces / 1-10 / slider)
// so it reads the same on their AniList profile. Works logged-out too (local,
// syncs on sign-in) and defaults to a 1-10 control when no format is known.
// Mirrors StatusSelect: a compact trigger that opens a popover.

type Control = 'stars' | 'faces' | 'ten' | 'slider';

const controlFor = (f: ScoreFormat): Control => {
  if (f === 'POINT_5') return 'stars';
  if (f === 'POINT_3') return 'faces';
  if (f === 'POINT_10') return 'ten';
  return 'slider'; // POINT_100, POINT_10_DECIMAL
};

// scoreRaw (0-100) -> the face index 0..3 (0 = unrated).
const faceOf = (raw: number): number => {
  if (raw <= 0) return 0;
  if (raw <= 40) return 1;
  if (raw <= 70) return 2;
  return 3;
};

// Compact value shown on the trigger for each format.
const triggerValue = (raw: number, f: ScoreFormat): string => {
  if (f === 'POINT_5') return String(Math.round(raw / 20));
  if (f === 'POINT_3') return ['', '1', '2', '3'][faceOf(raw)];
  if (f === 'POINT_100') return String(raw);
  if (f === 'POINT_10_DECIMAL') return (raw / 10).toFixed(1);
  return String(Math.round(raw / 10));
};

const scaleLabel = (f: ScoreFormat): string => {
  if (f === 'POINT_5') return 'out of 5';
  if (f === 'POINT_3') return '';
  if (f === 'POINT_100') return 'out of 100';
  return 'out of 10';
};

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

// Three mood faces for POINT_3: sad / neutral / happy, by index 1..3.
const Face: React.FC<{ mood: 1 | 2 | 3 }> = ({ mood }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-7 w-7"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.8}
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <circle cx="9" cy="10" r="0.6" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="0.6" fill="currentColor" stroke="none" />
    {mood === 1 && <path d="M8.5 15.5c1-1.2 5-1.2 7 0" />}
    {mood === 2 && <path d="M8.5 15h7" />}
    {mood === 3 && <path d="M8.5 14.5c1 1.4 5 1.4 7 0" />}
  </svg>
);

const RatingSelect: React.FC<{ id: number; inline?: boolean }> = ({
  id,
  inline = false,
}) => {
  const { session } = useAniListAuth();
  const format: ScoreFormat = session?.scoreFormat ?? 'POINT_10';
  const raw = useScore(id);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inline) return undefined; // inline mode has no popover to dismiss
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [inline]);

  const control = controlFor(format);
  const scored = raw > 0;

  // Toggle helper: tapping the value you already have clears it.
  const choose = (next: number) => setScore(id, raw === next ? 0 : next);

  const renderControl = () => {
    if (control === 'stars') {
      const stars = Math.round(raw / 20);
      return (
        <div className="flex items-center gap-1 text-accent">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} of 5`}
              onClick={() => choose(n * 20)}
              className="transition hover:scale-110 active:scale-95"
            >
              <Star filled={n <= stars} />
            </button>
          ))}
        </div>
      );
    }

    if (control === 'faces') {
      const face = faceOf(raw);
      const moods: { mood: 1 | 2 | 3; raw: number; label: string }[] = [
        { mood: 1, raw: 35, label: 'Meh' },
        { mood: 2, raw: 60, label: 'Good' },
        { mood: 3, raw: 85, label: 'Great' },
      ];
      return (
        <div className="flex items-center gap-3">
          {moods.map((m) => (
            <button
              key={m.mood}
              type="button"
              aria-label={m.label}
              onClick={() => choose(m.raw)}
              className={`transition hover:scale-110 active:scale-95 ${
                face === m.mood ? 'text-accent' : 'text-muted hover:text-fg'
              }`}
            >
              <Face mood={m.mood} />
            </button>
          ))}
        </div>
      );
    }

    if (control === 'ten') {
      const n = Math.round(raw / 10);
      return (
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => choose(v * 10)}
              className={`h-8 rounded-lg text-sm font-semibold transition active:scale-95 ${
                v <= n
                  ? 'bg-aurora text-accent-ink shadow-glow'
                  : 'bg-surface/70 text-muted hover:text-fg'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      );
    }

    // slider: POINT_100 (0-100, step 1) or POINT_10_DECIMAL (0-10, step .5)
    const decimal = format === 'POINT_10_DECIMAL';
    const max = decimal ? 10 : 100;
    const step = decimal ? 0.5 : 1;
    const value = decimal ? raw / 10 : raw;
    return (
      <div className="flex flex-col gap-2">
        <div className="text-center font-display text-2xl font-bold tabular-nums text-accent">
          {decimal ? value.toFixed(1) : value}
          <span className="ml-1 text-sm font-medium text-faint">/ {max}</span>
        </div>
        <input
          type="range"
          min={0}
          max={max}
          step={step}
          value={value}
          aria-label="Your rating"
          onChange={(e) =>
            setScore(
              id,
              Math.round(Number(e.target.value) * (decimal ? 10 : 1))
            )
          }
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line accent-accent"
        />
      </div>
    );
  };

  if (inline) {
    return (
      <div>
        <div className="mb-3 flex items-baseline justify-between gap-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            Your rating
          </p>
          {scaleLabel(format) && (
            <p className="text-[0.7rem] text-faint">{scaleLabel(format)}</p>
          )}
        </div>
        {renderControl()}
        {scored && (
          <button
            type="button"
            onClick={() => clearScore(id)}
            className="mt-3 text-xs text-muted transition hover:text-fg"
          >
            Clear rating
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          scored ? `Your rating: ${triggerValue(raw, format)}` : 'Rate'
        }
        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition active:scale-95 ${
          scored
            ? 'border-accent/60 bg-surface/70 text-fg hover:border-accent'
            : 'border-line/70 bg-surface/70 text-fg hover:border-accent/60'
        }`}
      >
        <span className={scored ? 'text-accent' : 'text-muted'}>
          <Star filled={scored} />
        </span>
        {scored ? triggerValue(raw, format) : 'Rate'}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-2 w-max max-w-[90vw] rounded-2xl border border-line/60 bg-canvas/95 p-4 shadow-lift ring-1 ring-line/40 backdrop-blur-xl"
        >
          <div className="mb-3 flex items-baseline justify-between gap-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">
              Your rating
            </p>
            {scaleLabel(format) && (
              <p className="text-[0.7rem] text-faint">{scaleLabel(format)}</p>
            )}
          </div>

          {renderControl()}

          {scored && (
            <button
              type="button"
              onClick={() => clearScore(id)}
              className="mt-3 w-full rounded-lg border-t border-line/50 pt-3 text-center text-xs text-muted transition hover:text-fg"
            >
              Clear rating
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default RatingSelect;
