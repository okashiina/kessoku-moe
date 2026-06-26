import { useCallback, useEffect, useState } from 'react';

import { useSelector } from '@store/store';
import { fetchSkipMarkers, type SkipMarkers } from '@utility/aniskip';

import EmbedPlayer from './EmbedPlayer';
import HlsPlayer, { type Subtitle } from './HlsPlayer';

// Our self-hosted source pipeline (Option B). When NEXT_PUBLIC_SOURCE_SERVICE_URL
// is set (local dev / a VPS), we ask it to resolve a real m3u8 (AnimePahe via
// FlareSolverr, proxied through /hls) and play it in our own player (HlsPlayer)
// with quality selection. If it isn't set, resolving fails, or the user prefers
// it, we fall back to the third-party embed switcher. Switchable both ways.

const SOURCE_SERVICE = process.env.NEXT_PUBLIC_SOURCE_SERVICE_URL;

// Direct-pipeline server choice. 'auto' = resolver's fallback chain (KAA first, then
// AnimePahe); the others force one provider. KAA is the primary pick: clean/RAW video
// with JP audio + soft subtitles, but it CF-solves so it starts a beat slower on a cold
// title. AnimePahe (HLS, hardsub) is faster if you want an instant start.
const PROVIDER_PREF_KEY = 'kessoku.source.provider';
const DIRECT_PROVIDERS = [
  { id: 'auto', label: 'Auto' },
  { id: 'kaa', label: 'KAA' },
  { id: 'animepahe', label: 'AnimePahe' },
  { id: 'allanime', label: 'AllAnime' },
  { id: 'hianime', label: 'HiAnime' },
] as const;

interface Source {
  url: string;
  quality?: string;
}
interface WatchResponse {
  mode: 'direct' | 'embed';
  provider?: string;
  sources?: Source[];
  subtitles?: Subtitle[];
}

const Frame: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="aspect-w-16 aspect-h-9 w-full overflow-hidden rounded-2xl bg-canvas-2 shadow-card ring-1 ring-line/40">
    {children}
  </div>
);

const SourcePlayer: React.FC<{
  titles: string[];
  malId?: number | null;
  onNext?: () => void;
  // The AI watch companion, forwarded to HlsPlayer for the fullscreen dock.
  companionSlot?: React.ReactNode;
  // On-video overlay (danmaku + reaction floaties), forwarded to HlsPlayer.
  overlaySlot?: React.ReactNode;
  // Follower lock (co-watch): when this viewer isn't the room leader, the
  // playback controls are locked and a "who has the remote" indicator shows.
  // Forwarded to HlsPlayer; the leader / solo viewer is never locked.
  controlsLocked?: boolean;
  leaderName?: string;
}> = ({
  titles,
  malId,
  onNext,
  companionSlot,
  overlaySlot,
  controlsLocked,
  leaderName,
}) => {
  const animeId = useSelector((store) => store.anime.anime);
  const episode = useSelector((store) => store.episode.episode);
  const useDub = useSelector((store) => store.videoSettings.useDub);
  const totalEpisodes = useSelector((store) => store.gogoApi.totalEpisodes);

  const [phase, setPhase] = useState<'loading' | 'direct' | 'embed'>(
    SOURCE_SERVICE ? 'loading' : 'embed'
  );
  const [sources, setSources] = useState<Source[]>([]);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [provider, setProvider] = useState('');
  const [qIdx, setQIdx] = useState(0);
  // Our HLS pipeline resolved, but the browser couldn't decode it (codec) --
  // we auto-dropped to embed and tell the user why.
  const [decodeFailed, setDecodeFailed] = useState(false);
  // Which direct provider to resolve with: 'auto' = fallback chain, else forced.
  // Default to KAA (clean/RAW JP + soft subs); a forced-KAA miss self-heals to the
  // Auto chain below, so this is safe even when KAA is cold or unavailable.
  const [pref, setPref] = useState<string>('kaa');
  // Intro/outro skip markers (AniSkip), fetched per MAL id + episode.
  const [skipMarkers, setSkipMarkers] = useState<SkipMarkers>({});

  // Stable key for the titles array (a fresh array every render would loop).
  const titlesKey = titles.join(',');

  // Restore the saved server preference (SSR can't read localStorage).
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(PROVIDER_PREF_KEY);
      if (v && DIRECT_PROVIDERS.some((p) => p.id === v)) setPref(v);
      else if (v) window.localStorage.setItem(PROVIDER_PREF_KEY, 'auto');
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const choosePref = useCallback((id: string) => {
    setPref(id);
    try {
      window.localStorage.setItem(PROVIDER_PREF_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  // Resolve a direct source from our server. Keeps the resolved sources so the
  // user can switch back to our player after using embed.
  const resolve = useCallback(() => {
    if (!SOURCE_SERVICE) {
      setPhase('embed');
      return undefined;
    }
    setPhase('loading');
    setSources([]);
    setSubtitles([]);
    setQIdx(0);
    setDecodeFailed(false);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90000);
    // Set when a newer resolve supersedes this one (episode/dub/server changed,
    // or the saved server pref hydrates right after mount and re-runs the
    // effect). A superseded attempt must not touch state: its abort lands in
    // .catch, which used to stomp the new attempt's 'loading' with 'embed' --
    // the page looked like it gave up on our server the instant it opened.
    let superseded = false;
    const category = useDub ? 'dub' : 'sub';
    const url =
      `${SOURCE_SERVICE}/watch?anilistId=${animeId}&episode=${episode}` +
      `&category=${category}&titles=${encodeURIComponent(titlesKey)}${
        pref !== 'auto' ? `&provider=${pref}` : ''
      }`;

    fetch(url, { signal: controller.signal })
      .then((r) => r.json() as Promise<WatchResponse>)
      .then((data) => {
        if (superseded) return;
        if (data.mode === 'direct' && data.sources && data.sources.length > 0) {
          setSources(data.sources);
          setSubtitles(data.subtitles || []);
          setProvider(data.provider || '');
          setPhase('direct');
        } else if (pref !== 'auto') {
          // A FORCED provider couldn't resolve (e.g. AllAnime is captcha-blocked
          // right now) -- don't drop straight to an embed server: fall through to
          // the Auto chain (AnimePahe) so our player still plays. In-memory only,
          // so the saved preference returns if that provider recovers later.
          setPref('auto');
        } else {
          setPhase('embed');
        }
      })
      .catch(() => {
        // Real failures (service down, 90s timeout) fall back to embed; a
        // superseded attempt stays silent and lets the newer one decide.
        if (!superseded) setPhase('embed');
      })
      .finally(() => clearTimeout(timer));

    return () => {
      superseded = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [animeId, episode, useDub, titlesKey, pref]);

  // Re-resolve whenever the episode / dub / server choice changes.
  useEffect(() => resolve(), [resolve]);

  // Fetch skip markers for the current episode (no-op without a MAL id).
  useEffect(() => {
    setSkipMarkers({});
    if (!malId) return undefined;
    const controller = new AbortController();
    fetchSkipMarkers(malId, episode, controller.signal).then(setSkipMarkers);
    return () => controller.abort();
  }, [malId, episode]);

  const hasOurPlayer = sources.length > 0;

  // Server picker (direct pipeline only). Shown in every phase so the user can
  // switch providers / test AllAnime even after a failure dropped them to embed.
  const serverPicker = SOURCE_SERVICE ? (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-faint">Server</span>
      <div className="inline-flex overflow-hidden rounded-full border border-line/60">
        {DIRECT_PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => choosePref(p.id)}
            className={`inline-flex min-h-[40px] items-center px-3 font-semibold transition [touch-action:manipulation] ${
              pref === p.id
                ? 'bg-aurora text-accent-ink shadow-glow'
                : 'text-muted hover:bg-fg/5 hover:text-fg'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {phase === 'direct' && provider && (
        <span className="text-faint">
          playing via <span className="text-muted">{provider}</span>
        </span>
      )}
      {pref === 'allanime' && (
        <span className="text-faint">
          AllAnime is the sharpest picture, but it takes a beat longer to start
          (~30 to 60s on the first load)
        </span>
      )}
      {pref === 'hianime' && (
        <span className="text-faint">
          HiAnime is soft-sub capable, but may fail on this network without a
          clean VPS
        </span>
      )}
    </div>
  ) : null;

  // ---- Embed view (manual fallback or resolve/decode failure) ----
  if (phase === 'embed') {
    // decodeFailed: re-showing 'direct' would just hit the same undecodable
    // source, so the retry re-runs the resolver from scratch instead.
    let switchLabel = 'Try our server';
    if (decodeFailed) switchLabel = 'Retry our player';
    else if (hasOurPlayer) switchLabel = 'Switch to our player (HD)';

    const switchHint = decodeFailed
      ? "our player couldn't decode this episode here -- using an embed server"
      : 'or pick a third-party server above';

    const onSwitch = () => {
      if (decodeFailed || !hasOurPlayer) resolve();
      else setPhase('direct');
    };

    return (
      <div className="space-y-2.5">
        <EmbedPlayer />
        <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
          <button
            type="button"
            onClick={onSwitch}
            className="rounded-full bg-aurora px-3 py-1 font-semibold text-accent-ink shadow-glow transition active:scale-95"
          >
            {switchLabel}
          </button>
          <span>{switchHint}</span>
        </div>
        {serverPicker}
      </div>
    );
  }

  // ---- Loading our source ----
  if (phase === 'loading') {
    return (
      <div className="space-y-2.5">
        <Frame>
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <span className="h-9 w-9 animate-spin rounded-full border-2 border-line border-t-accent" />
            <p className="text-sm text-muted">Finding the best source...</p>
            <p className="text-xs text-faint">resolving via our server</p>
          </div>
        </Frame>
        <button
          type="button"
          onClick={() => setPhase('embed')}
          className="text-xs font-medium text-faint underline-offset-2 hover:text-fg hover:underline"
        >
          Taking too long? Watch on an embed server instead
        </button>
        {serverPicker}
      </div>
    );
  }

  // ---- Direct (our) player ----
  return (
    <div className="space-y-2.5">
      <HlsPlayer
        sources={sources}
        qIdx={qIdx}
        onQuality={setQIdx}
        provider={provider}
        subtitles={subtitles}
        onUseEmbed={() => setPhase('embed')}
        onUnplayable={() => {
          setDecodeFailed(true);
          setPhase('embed');
        }}
        onNext={onNext}
        animeId={animeId}
        episode={episode}
        total={totalEpisodes}
        skipMarkers={skipMarkers}
        companionSlot={companionSlot}
        overlaySlot={overlaySlot}
        controlsLocked={controlsLocked}
        leaderName={leaderName}
      />
      {serverPicker}
    </div>
  );
};

export default SourcePlayer;
