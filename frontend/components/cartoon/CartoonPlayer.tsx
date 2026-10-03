import { useEffect, useState } from 'react';

import type { CartoonVideo } from '@utility/cartoonSources';

interface Props {
  title: string;
  videos: CartoonVideo[];
  imdbId: string | null;
  season: number;
  episode: number;
}

const CartoonPlayer = ({ title, videos, imdbId, season, episode }: Props) => {
  const hasEpisodeServer = Boolean(imdbId && /^tt\d+$/.test(imdbId));
  const [source, setSource] = useState<'episode' | 'official'>(
    hasEpisodeServer ? 'episode' : 'official'
  );
  const [officialSeason, setOfficialSeason] = useState(season);
  useEffect(() => {
    setOfficialSeason(season);
    if (hasEpisodeServer) setSource('episode');
  }, [episode, hasEpisodeServer, season]);
  const officialVideo =
    videos.find((video) => video.season === officialSeason) || videos[0];
  if (!hasEpisodeServer && !officialVideo) return null;

  const isOfficial = source === 'official' && Boolean(officialVideo);
  const src = isOfficial
    ? `https://www.youtube-nocookie.com/embed/${officialVideo.videoId}?rel=0`
    : `https://vidsrc.sh/embed/tv/${imdbId}/${season}/${episode}`;

  return (
    <div className="space-y-2.5">
      <div className="aspect-w-16 aspect-h-9 relative w-full overflow-hidden rounded-2xl bg-canvas-2 shadow-card ring-1 ring-line/40">
        <iframe
          key={src}
          src={src}
          title={`${title}, ${
            isOfficial
              ? `full season ${officialVideo.season}`
              : `season ${season}, episode ${episode}`
          }`}
          className="border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <div
        className="flex flex-wrap items-center gap-1.5 text-xs text-faint"
        role="group"
        aria-label="Video source"
      >
        <span className="mr-1">Server</span>
        {hasEpisodeServer && (
          <button
            type="button"
            onClick={() => setSource('episode')}
            aria-pressed={!isOfficial}
            className={`min-h-[44px] rounded-full px-3 font-semibold transition ${
              !isOfficial
                ? 'bg-aurora text-accent-ink shadow-glow'
                : 'border border-line/60 text-muted hover:text-fg'
            }`}
          >
            VidSrc · episode
          </button>
        )}
        {videos.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setOfficialSeason(season);
              setSource('official');
            }}
            aria-pressed={isOfficial}
            className={`min-h-[44px] rounded-full px-3 font-semibold transition ${
              isOfficial
                ? 'bg-aurora text-accent-ink shadow-glow'
                : 'border border-line/60 text-muted hover:text-fg'
            }`}
          >
            Official · full season
          </button>
        )}
        {isOfficial && videos.length > 1 && (
          <select
            aria-label="Official video season"
            value={officialVideo.season}
            onChange={(event) => setOfficialSeason(Number(event.target.value))}
            className="min-h-[44px] rounded-full border border-line/60 bg-surface px-3 text-fg"
          >
            {videos.map((video) => (
              <option key={video.videoId} value={video.season}>
                Season {video.season}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="text-xs text-faint">
        {isOfficial
          ? 'Full-season video hosted by YouTube.'
          : 'Third-party embed. Switch servers if this episode is unavailable.'}
      </p>
    </div>
  );
};

export default CartoonPlayer;
