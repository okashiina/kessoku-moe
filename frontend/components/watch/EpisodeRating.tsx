import useAniListAuth from '@hooks/useAniListAuth';
import { useEpisodeRatings } from '@hooks/useEpisodeRatings';

// "Rate this episode" widget for the episode in play. Shows the community average
// (on a 1-10 dial) and lets a signed-in viewer score it; browsing to another
// episode re-points it, so the panel doubles as the per-episode ratings view.
// Separate from the show rating (that syncs to AniList) — this writes our DB.

const EpisodeRating: React.FC<{ animeId: number; episode: number }> = ({
  animeId,
  episode,
}) => {
  const { isLoggedIn, login } = useAniListAuth();
  const { aggregates, mine, rate, clear, unavailable } =
    useEpisodeRatings(animeId);

  // Nothing to show before an episode is resolved, or when the DB isn't set up.
  if (!episode || unavailable) return null;

  const agg = aggregates[episode];
  const myScore = mine[episode] ?? 0;
  const myTen = Math.round(myScore / 10);

  // Tapping the value you already hold clears it.
  const choose = (n: number): void => {
    if (myScore === n * 10) clear(episode);
    else rate(episode, n * 10);
  };

  return (
    <section className="rounded-2xl border border-line/50 bg-surface/30 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-sm font-bold text-fg">
          Rate episode {episode}
        </h3>
        {agg ? (
          <p className="text-xs">
            <span className="font-semibold text-accent">
              {(agg.avg / 10).toFixed(1)}
            </span>
            <span className="text-faint"> / 10</span>
            <span className="text-faint">
              {' '}
              · {agg.count} {agg.count === 1 ? 'rating' : 'ratings'}
            </span>
          </p>
        ) : (
          <p className="text-xs text-faint">No ratings yet</p>
        )}
      </div>

      {isLoggedIn ? (
        <>
          <div className="mt-3 grid grid-cols-5 gap-1.5 sm:grid-cols-10">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => choose(n)}
                aria-label={`${n} out of 10`}
                aria-pressed={n <= myTen}
                className={`h-9 rounded-lg text-sm font-semibold tabular-nums transition active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                  n <= myTen
                    ? 'bg-aurora text-accent-ink shadow-glow'
                    : 'bg-surface/70 text-muted hover:text-fg'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          {myScore > 0 && (
            <button
              type="button"
              onClick={() => clear(episode)}
              className="mt-2.5 text-xs text-muted transition hover:text-fg"
            >
              Clear my rating
            </button>
          )}
        </>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={login}
            className="inline-flex items-center gap-2 rounded-full border border-line/70 bg-surface/70 px-4 py-2 text-sm font-semibold text-fg transition hover:border-accent/60 active:scale-95 motion-reduce:active:scale-100"
          >
            Sign in to rate
          </button>
          <span className="text-xs text-faint">
            Scores come from signed-in fans, so they stay honest.
          </span>
        </div>
      )}
    </section>
  );
};

export default EpisodeRating;
