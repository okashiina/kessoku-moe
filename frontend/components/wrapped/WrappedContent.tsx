import Headliner from './Headliner';
import StatCard from './StatCard';
import StatusBars from './StatusBars';
import type { WrappedStats } from './useWrappedStats';

// The populated Wrapped view. Stage/set-list framing for the Kessoku brand: a
// few headline numbers, then the headliners (top series), then the shelf
// breakdown. Only renders metrics that are actually present, so a manga-only or
// anime-only reader never sees an empty half.
interface WrappedContentProps {
  stats: WrappedStats;
}

const WrappedContent: React.FC<WrappedContentProps> = ({ stats }) => {
  const {
    chaptersRead,
    episodesWatched,
    streakDays,
    mangaSeries,
    animeSeries,
    mangaStatus,
    animeStatus,
    topManga,
    topAnime,
  } = stats;

  const hasManga = mangaSeries > 0;
  const hasAnime = animeSeries > 0;

  return (
    <div className="flex flex-col gap-8">
      {/* Headline numbers. The biggest of chapters/episodes takes the aurora
          card so the page has one clear focal figure, not an even grid. */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4">
        {hasManga && (
          <StatCard
            value={chaptersRead}
            label="Chapters read"
            hint={`across ${mangaSeries} series`}
            accent={chaptersRead >= episodesWatched}
          />
        )}
        {hasAnime && (
          <StatCard
            value={episodesWatched}
            label="Episodes watched"
            hint={`across ${animeSeries} ${
              animeSeries === 1 ? 'show' : 'shows'
            }`}
            accent={episodesWatched > chaptersRead}
          />
        )}
        {streakDays > 0 && (
          <StatCard
            value={streakDays}
            label={streakDays === 1 ? 'Day streak' : 'Days on a streak'}
            hint="reading or watching, back to back"
            className={!hasManga || !hasAnime ? '' : 'col-span-2'}
          />
        )}
      </section>

      {/* Headliners: the series you gave the most to. */}
      {(topManga || topAnime) && (
        <section>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="h-5 w-1 rounded-full bg-aurora" aria-hidden />
            <h2 className="font-display text-lg font-bold tracking-tight text-fg">
              Your headliners
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {topManga && <Headliner highlight={topManga} />}
            {topAnime && <Headliner highlight={topAnime} />}
          </div>
        </section>
      )}

      {/* Shelf breakdown by status. */}
      {(hasManga || hasAnime) && (
        <section>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="h-5 w-1 rounded-full bg-aurora" aria-hidden />
            <h2 className="font-display text-lg font-bold tracking-tight text-fg">
              Your shelf
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {hasManga && (
              <StatusBars
                title="Manga"
                rows={[
                  { label: 'Reading', count: mangaStatus.reading },
                  { label: 'Completed', count: mangaStatus.completed },
                  { label: 'Plan to read', count: mangaStatus.plan },
                ]}
              />
            )}
            {hasAnime && (
              <StatusBars
                title="Anime"
                rows={[
                  { label: 'Watching', count: animeStatus.watching },
                  { label: 'Completed', count: animeStatus.completed },
                  { label: 'Plan to watch', count: animeStatus.planning },
                ]}
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default WrappedContent;
