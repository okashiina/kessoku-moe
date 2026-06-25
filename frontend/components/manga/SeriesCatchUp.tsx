import { useCallback, useEffect, useState } from 'react';

import { SparklesIcon } from '@heroicons/react/outline';

import { getMangaEntry } from '@utility/mangaProgress';

// One-tap "Catch me up" on the manga detail page: an AI recap of the story up to
// the chapter the reader last finished, spoiler-bounded. Series-level — separate
// from the per-chapter Reading Companion inside the reader. Reads the local
// last-read chapter from mangaProgress, posts it to /api/manga/series-recap, and
// renders the single recap (loading, slow-down, error, and empty states).

interface RecapResponse {
  recap?: string;
  unavailable?: boolean;
  message?: string;
  reason?: string;
}

type Phase = 'idle' | 'loading' | 'done' | 'error';

const SeriesCatchUp: React.FC<{ anilistId: number; title: string }> = ({
  anilistId,
  title,
}) => {
  // Last-read chapter from local progress. 0 means not started -> we offer a
  // spoiler-safe recap "up to chapter 1" (a gentle setup) rather than hiding it.
  const [lastCh, setLastCh] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [recap, setRecap] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const entry = getMangaEntry(anilistId);
    setLastCh(entry?.ch ?? 0);
  }, [anilistId]);

  const upToChapter = lastCh && lastCh > 0 ? lastCh : 1;
  const started = (lastCh ?? 0) > 0;

  const run = useCallback(async (): Promise<void> => {
    setPhase('loading');
    setNote('');
    setRecap('');
    try {
      const response = await fetch('/api/manga/series-recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anilistId, upToChapter }),
      });
      if (response.status === 429) {
        let reason = '';
        try {
          const data = (await response.json()) as RecapResponse;
          reason = String(data?.reason || '');
        } catch {
          /* ignore */
        }
        setNote(
          reason === 'daily'
            ? "That's the free recap quota for today. Catch you tomorrow."
            : 'One at a time. Give it a few seconds and tap again.'
        );
        setPhase('error');
        return;
      }
      if (!response.ok) {
        setNote('I lost the signal. Give it another shot.');
        setPhase('error');
        return;
      }
      const data = (await response.json()) as RecapResponse;
      if (data.recap) {
        setRecap(data.recap);
        setPhase('done');
        return;
      }
      setNote(data.message || 'No recap right now. Try again in a bit.');
      setPhase('error');
    } catch {
      setNote('I lost the signal. Give it another shot.');
      setPhase('error');
    }
  }, [anilistId, upToChapter]);

  // Wait until we've read local progress before rendering, so the label is right.
  if (lastCh === null) return null;

  const label = started ? `Catch me up to ch. ${upToChapter}` : 'Catch me up';

  return (
    <section className="mt-4 max-w-3xl">
      <button
        type="button"
        onClick={run}
        disabled={phase === 'loading'}
        aria-label={label}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line/60 bg-surface/60 px-4 text-sm font-semibold text-muted transition [touch-action:manipulation] hover:border-accent/60 hover:text-fg active:scale-95 disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <SparklesIcon
          className={`h-4 w-4 text-accent ${
            phase === 'loading'
              ? 'animate-pulse motion-reduce:animate-none'
              : ''
          }`}
          aria-hidden="true"
        />
        {phase === 'loading' ? 'Catching you up…' : label}
      </button>

      {started ? (
        <p className="mt-1.5 px-1 text-xs text-muted">
          Spoiler-safe up to chapter {upToChapter}. Nothing past where you are.
        </p>
      ) : (
        <p className="mt-1.5 px-1 text-xs text-muted">
          Haven&apos;t started yet, so this stays at the setup, no spoilers.
        </p>
      )}

      {phase === 'done' && recap && (
        <div
          aria-live="polite"
          className="mt-3 rounded-2xl border border-line/50 bg-surface/40 px-4 py-3.5 shadow-lift"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-aurora text-accent-ink shadow-glow">
              <SparklesIcon className="h-4 w-4" aria-hidden="true" />
            </span>
            <p className="min-w-0 truncate font-display text-sm font-bold text-fg">
              {title}: story so far
            </p>
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
            {recap}
          </p>
        </div>
      )}

      {phase === 'error' && note && (
        <p role="status" className="mt-2 px-1 text-xs text-accent">
          {note}
        </p>
      )}
    </section>
  );
};

export default SeriesCatchUp;
