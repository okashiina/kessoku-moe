import { useCallback, useEffect, useRef, useState } from 'react';

import { useScore } from '@utility/listScore';
import { getEntry, isWatched, subscribeProgress } from '@utility/progress';
import {
  getRatePromptSeen,
  markRatePromptSeen,
} from '@utility/ratePromptStore';

// Decides when to surface the "rate this show" prompt on the watch page.
// MANDATORY moment: the viewer finished the LAST available episode (the finale,
// or the latest aired episode while a show is still airing) — "you're caught up,
// what did you think?". Plus a RARE random nudge when opening a mid-series
// episode, only for a viewer who's a few episodes in. Never naggy: suppressed
// once the show is rated, shown at most once per cooldown per anime, dismissible.

const COOLDOWN_MS = 1000 * 60 * 60 * 24 * 14; // 2 weeks of quiet after show/dismiss
const RANDOM_CHANCE = 0.12;
const INVESTED_EPISODES = 3; // min watched before the random nudge is allowed

export interface RateShowPromptState {
  open: boolean;
  dismiss: () => void;
}

export const useRateShowPrompt = (
  animeId: number,
  episode: number,
  totalEpisodes: number
): RateShowPromptState => {
  const score = useScore(animeId);
  const [open, setOpen] = useState(false);
  // One random roll per (anime, episode) open, regardless of outcome.
  const rolledFor = useRef('');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const evaluate = () => {
      if (score > 0 || open) return; // already rated, or already showing
      if (Date.now() - getRatePromptSeen(animeId) < COOLDOWN_MS) return;

      const atLast = totalEpisodes > 0 && episode >= totalEpisodes;
      if (atLast) {
        // Mandatory: fire once they've actually finished the last episode.
        if (isWatched(animeId, episode)) {
          markRatePromptSeen(animeId);
          setOpen(true);
        }
        return;
      }

      // Rare nudge on a mid-series episode — roll once per open, invested only.
      const key = `${animeId}:${episode}`;
      if (rolledFor.current === key) return;
      rolledFor.current = key;
      const watched = getEntry(animeId)?.watched.length ?? 0;
      if (watched >= INVESTED_EPISODES && Math.random() < RANDOM_CHANCE) {
        markRatePromptSeen(animeId);
        setOpen(true);
      }
    };

    evaluate(); // opened an already-finished finale, or the random nudge
    const unsub = subscribeProgress(evaluate); // just finished the finale
    return unsub;
  }, [animeId, episode, totalEpisodes, score, open]);

  const dismiss = useCallback(() => {
    markRatePromptSeen(animeId);
    setOpen(false);
  }, [animeId]);

  // Stays open after a rating is set (so slider/number users can fine-tune and
  // see it land); `evaluate` already refuses to RE-open a show that's rated.
  return { open, dismiss };
};
