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

const reveal =
  'animate-rise motion-reduce:animate-none motion-reduce:opacity-100';

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
    <div className="flex flex-col gap-12">
      {/* Headline numbers. The biggest of chapters/episodes takes the pink
          plate so the page has one clear focal figure, not an even grid. */}
      <section
        className={`flex flex-col gap-8 border-b border-[#463b49] pb-10 ${reveal}`}
      >
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
          />
        )}
      </section>

      {/* Headliners: the series you gave the most to. */}
      {(topManga || topAnime) && (
        <section className={reveal} style={{ animationDelay: '80ms' }}>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-[#f4ecef] sm:text-3xl">
            Your headliners
          </h2>
          <div className="mt-6 grid gap-10 sm:grid-cols-2">
            {topManga && <Headliner highlight={topManga} />}
            {topAnime && <Headliner highlight={topAnime} />}
          </div>
        </section>
      )}

      {/* Shelf breakdown by status. */}
      {(hasManga || hasAnime) && (
        <section className={reveal} style={{ animationDelay: '160ms' }}>
          <h2 className="font-display text-2xl font-extrabold tracking-tight text-[#f4ecef] sm:text-3xl">
            Your shelf
          </h2>
          <div className="mt-6 flex flex-col gap-10 sm:flex-row sm:gap-12">
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
