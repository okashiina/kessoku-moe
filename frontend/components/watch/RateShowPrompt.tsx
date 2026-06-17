import { useEffect } from 'react';

import { XIcon } from '@heroicons/react/outline';

import RatingSelect from '@components/anime/RatingSelect';
import { useRateShowPrompt } from '@hooks/useRateShowPrompt';
import { useScore } from '@utility/listScore';

// The "rate this show" nudge. Fires when the viewer is caught up (finished the
// last/latest episode), plus a rare random nudge mid-series (see
// useRateShowPrompt). Brand-styled modal mirroring AniListBenefitsModal; the
// rating control sits inline so it's one tap, not a button that opens a popover.

interface Props {
  animeId: number;
  episode: number;
  totalEpisodes: number;
  title: string;
}

const RateShowPrompt: React.FC<Props> = ({
  animeId,
  episode,
  totalEpisodes,
  title,
}) => {
  const { open, dismiss } = useRateShowPrompt(animeId, episode, totalEpisodes);
  const scored = useScore(animeId) > 0;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] grid animate-fade-in place-items-center bg-canvas/80 px-4 backdrop-blur-sm motion-reduce:animate-none"
      role="presentation"
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rate-show-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm animate-fade-in rounded-2xl border border-line/60 bg-canvas-2 p-6 shadow-lift motion-reduce:animate-none"
      >
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1 text-faint transition hover:bg-surface/70 hover:text-fg"
        >
          <XIcon className="h-5 w-5" />
        </button>

        {/* Brand mark — the guitar-pick / play icon */}
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface ring-1 ring-line/50">
          {/* eslint-disable-next-line @next/next/no-img-element -- inline brand SVG */}
          <img src="/kessoku-moe-icon.svg" alt="" className="h-7 w-7" />
        </span>

        <h2
          id="rate-show-title"
          className="mt-4 font-display text-xl font-bold tracking-tight text-fg"
        >
          All caught up
        </h2>
        {title && (
          <p className="mt-1 truncate text-sm font-medium text-muted">
            {title}
          </p>
        )}
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          You blew through to the latest. What would you give it?
        </p>

        <div className="mt-5 rounded-2xl border border-line/50 bg-surface/40 p-4">
          <RatingSelect id={animeId} inline />
        </div>

        <button
          type="button"
          onClick={dismiss}
          className="mx-auto mt-4 block text-xs font-medium text-muted transition hover:text-fg"
        >
          {scored ? 'Done' : 'Maybe later'}
        </button>
      </div>
    </div>
  );
};

export default RateShowPrompt;
