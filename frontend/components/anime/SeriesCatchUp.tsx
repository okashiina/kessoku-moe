import { useCallback, useEffect, useState } from 'react';

import { SparklesIcon } from '@heroicons/react/outline';

import { getEntry } from '@utility/progress';

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
  const [lastEpisode, setLastEpisode] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [recap, setRecap] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const entry = getEntry(anilistId);
    const watchedMax = entry?.watched.length ? Math.max(...entry.watched) : 0;
    setLastEpisode(Math.max(entry?.ep ?? 0, watchedMax));
  }, [anilistId]);

  const upToEpisode = lastEpisode && lastEpisode > 0 ? lastEpisode : 1;
  const started = (lastEpisode ?? 0) > 0;

  const run = useCallback(async (): Promise<void> => {
    setPhase('loading');
    setNote('');
    setRecap('');
    try {
      const response = await fetch('/api/anime/series-recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anilistId, upToEpisode }),
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
  }, [anilistId, upToEpisode]);

  if (lastEpisode === null) return null;

  const label = started ? `Catch me up to ep. ${upToEpisode}` : 'Catch me up';

  return (
    <section className="mx-auto mt-4 w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={run}
        disabled={phase === 'loading'}
        aria-label={label}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-line/60 bg-surface/60 px-4 text-sm font-semibold text-muted transition [touch-action:manipulation] hover:border-accent/60 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-95 disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <SparklesIcon
          className={`h-4 w-4 text-accent ${
            phase === 'loading'
              ? 'animate-pulse motion-reduce:animate-none'
              : ''
          }`}
          aria-hidden="true"
        />
        {phase === 'loading' ? 'Catching you up...' : label}
      </button>

      {started ? (
        <p className="mt-1.5 px-1 text-xs text-muted">
          Spoiler-safe up to episode {upToEpisode}. Nothing past where you are.
        </p>
      ) : (
        <p className="mt-1.5 px-1 text-xs text-muted">
          Haven&apos;t started yet, so this stays at the setup, no spoilers.
        </p>
      )}

      {phase === 'done' && recap && (
        <div
          aria-live="polite"
          className="mt-3 max-w-3xl rounded-2xl border border-line/50 bg-surface/40 px-4 py-3.5 shadow-lift"
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
