import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { ChatAlt2Icon } from '@heroicons/react/outline';

import { type SkipMarkers } from '@utility/aniskip';
import { registerAiredSource } from '@utility/companionContext';
import {
  type PlayerHandle,
  emitPlayerEvent,
  registerPlayerHandle,
  subscribePlayerEvent,
} from '@utility/playerBus';
import { getEntry, markWatched, savePosition } from '@utility/progress';

// Our own player chrome for the self-hosted (Option B) HLS stream. Native
// `<video controls>` can't be restyled and has no skip / PiP / settings, so we
// hide it and draw a kessoku-styled control layer over the raw <video>:
// scrubber w/ buffered range, configurable skip, volume, speed, quality, PiP,
// fullscreen, a keyboard-shortcut guide, and user-customizable subtitles
// (size / colour / background) rendered ourselves so styling is fully ours.
// No new dependency — hls.js is already a dep; icons are hand-rolled SVG.
// (The legacy Vime VideoPlayer.tsx is the dead GogoAnime player; untouched.)

interface Source {
  url: string;
  quality?: string;
}
export interface Subtitle {
  url: string;
  lang: string;
  label?: string;
}

interface HlsPlayerProps {
  sources: Source[];
  qIdx: number;
  onQuality: (i: number) => void;
  provider: string;
  subtitles?: Subtitle[];
  onUseEmbed: () => void;
  onUnplayable: () => void;
  onNext?: () => void;
  animeId?: number; // for watch-progress persistence (Continue watching)
  episode?: number;
  total?: number; // total episodes for the title (drives "finished" tracking)
  skipMarkers?: SkipMarkers; // AniSkip intro/outro times (drives Skip button)
  // The AI watch companion, rendered as a right-docked panel ONLY when the player
  // is fullscreen and the chat toggle is on (YouTube-theater style). Off
  // fullscreen the companion stays in the page right-rail, so this slot is null.
  companionSlot?: React.ReactNode;
  // On-video overlay (danmaku + reaction floaties), mounted inside the video
  // region so it tracks the picture windowed AND fullscreen. Always non-interactive
  // at the layer level; the slot owns its own pointer-events for any controls.
  overlaySlot?: React.ReactNode;
  // Follower lock (co-watch): true when this viewer is a follower (a connected
  // room has a leader who isn't us). The playback-affecting user gestures
  // (play/pause, seek, scrub, number-jump, next episode) are gated off and a
  // calm "who has the remote" indicator shows. The sync engine still drives the
  // player through its handle (play/pause/seek), so remote state keeps applying.
  // The leader / solo viewer is never locked and sees zero change.
  controlsLocked?: boolean;
  // Who holds the remote — shown in the lock indicator + tooltip. Only
  // meaningful when controlsLocked is true.
  leaderName?: string;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SKIPS = [5, 10, 15];
// Caption sizes scale with the player width (cqw — the stage is a container, see
// `containerType` on the stage element) and are clamped so they stay sane from a
// small windowed player up to a 4K fullscreen. Bigger than fixed px on hi-DPI.
const CAP_SIZES: { k: string; css: string }[] = [
  { k: 'S', css: 'clamp(13px, 1.8cqw, 36px)' },
  { k: 'M', css: 'clamp(15px, 2.2cqw, 46px)' },
  { k: 'L', css: 'clamp(18px, 2.8cqw, 64px)' },
  { k: 'XL', css: 'clamp(22px, 3.8cqw, 88px)' },
];
const PREFS_KEY = 'kessoku.player.v2';
// One-time cue that the companion is reachable from fullscreen (the dock exists
// but is undiscovered). Bumping the suffix re-shows it for everyone.
const HINT_KEY = 'kessoku.player.hint.v1';
const HIDE_MS = 2600;

// Providers whose video has NO burned-in subtitles, so our own captions are turned
// ON by default (raw / soft-sub sources). Hardsub providers stay off by default.
const NO_HARDSUB = new Set(['kaa', 'hianime']);

type CapColor = 'white' | 'yellow';
type CapBg = 'solid' | 'semi' | 'none';
const CAP_BG: Record<CapBg, string> = {
  solid: 'rgba(8,8,18,0.82)',
  semi: 'rgba(8,8,18,0.5)',
  none: 'transparent',
};
interface Prefs {
  skip: number;
  rate: number;
  volume: number;
  muted: boolean;
  capSize: string; // one of CAP_SIZES keys
  capColor: CapColor;
  capBg: CapBg;
  subOffset: number; // subtitle delay in seconds (+ = subs later)
  capPos: { x: number; y: number } | null; // drag position (% of stage); null = default bottom-centre
  autoNext: boolean; // auto-play the next episode at the end
  pinnedSubLangs: string[]; // starred subtitle langs, pinned to the top of the picker
  subDefaultLang: string | null; // remembered subtitle choice: a lang code, 'off', or null
}

const loadPrefs = (): Prefs => {
  const base: Prefs = {
    skip: 10,
    rate: 1,
    volume: 1,
    muted: false,
    capSize: 'M',
    capColor: 'white',
    capBg: 'semi',
    subOffset: 0,
    capPos: null,
    autoNext: true,
    pinnedSubLangs: [],
    subDefaultLang: null,
  };
  if (typeof window === 'undefined') return base;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...base, ...(JSON.parse(raw) as Partial<Prefs>) } : base;
  } catch {
    return base;
  }
};

const fmt = (s: number): string => {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
};

// Chrome can't addSourceBuffer for AAC Main ('mp4a.40.1'), but AnimePahe/kwik
// mis-signals AAC-LC audio as Main. Remap the codec at the MSE boundary so the
// buffer is created; the bytes decode either way. Scoped to this document.
function patchAacMainCodec(): void {
  if (typeof window === 'undefined' || typeof MediaSource === 'undefined')
    return;
  const w = window as unknown as { kessokuAacPatched?: boolean };
  if (w.kessokuAacPatched) return;
  w.kessokuAacPatched = true;
  const fix = (mime: string): string =>
    mime.replace(/mp4a\.40\.1\b/g, 'mp4a.40.2');
  const isSupported = MediaSource.isTypeSupported.bind(MediaSource);
  MediaSource.isTypeSupported = (mime: string) => isSupported(fix(mime));
  const add = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function patched(mime: string) {
    return add.call(this, fix(mime));
  };
}

// True only on iPhone/iPod: devices that have NO element-level Fullscreen API
// (no requestFullscreen / webkitRequestFullscreen on elements) but CAN fullscreen
// the bare <video> via webkitEnterFullscreen. iPad (element FS exists) and desktop
// are excluded, so their custom-chrome fullscreen is untouched. Feature-detected
// rather than UA-sniffed so it tracks the actual capability.
function videoFsOnly(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: unknown;
  };
  const v = document.createElement('video') as HTMLVideoElement & {
    webkitEnterFullscreen?: unknown;
  };
  return (
    !el.requestFullscreen &&
    !el.webkitRequestFullscreen &&
    typeof v.webkitEnterFullscreen === 'function'
  );
}

// ---- Hand-rolled SVG icons (consistent 2px stroke, currentColor) ----
type IconProps = { className?: string };
const S = (className?: string) => `h-[22px] w-[22px] ${className || ''}`;
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const PlayIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    className={className || 'h-[22px] w-[22px]'}
    aria-hidden="true"
  >
    <path d="M7 4.5v15l13-7.5z" fill="currentColor" />
  </svg>
);
const PauseIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    className={className || 'h-[22px] w-[22px]'}
    aria-hidden="true"
  >
    <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" fill="currentColor" />
  </svg>
);
// Circular arrow (Lucide rotate-ccw / -cw) with the interval centred inside —
// roomy enough that two digits never collide with the arrow.
const SkipBackIcon = ({ seconds }: { seconds: number }) => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <path d="M3 12a9 9 0 1 0 9-9 9.8 9.8 0 0 0-6.7 2.7L3 8" />
    <path d="M3 3v5h5" />
    <text
      x="12"
      y="13"
      fill="currentColor"
      stroke="none"
      fontSize="7.5"
      fontWeight="700"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {seconds}
    </text>
  </svg>
);
const SkipFwdIcon = ({ seconds }: { seconds: number }) => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <path d="M21 12a9 9 0 1 1-9-9 9.8 9.8 0 0 1 6.7 2.7L21 8" />
    <path d="M21 3v5h-5" />
    <text
      x="12"
      y="13"
      fill="currentColor"
      stroke="none"
      fontSize="7.5"
      fontWeight="700"
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {seconds}
    </text>
  </svg>
);
const VolumeIcon = ({ muted }: { muted: boolean }) => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
    {muted ? (
      <path d="M22 9l-6 6M16 9l6 6" />
    ) : (
      <>
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 6a9 9 0 0 1 0 12" />
      </>
    )}
  </svg>
);
const CcIcon = ({ active }: { active: boolean }) => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <rect
      x="3"
      y="5"
      width="18"
      height="14"
      rx="3"
      fill={active ? 'currentColor' : 'none'}
    />
    <path
      d="M9.5 10.5a2.4 2.4 0 1 0 0 3M16.5 10.5a2.4 2.4 0 1 0 0 3"
      stroke={active ? 'oklch(var(--accent-ink))' : 'currentColor'}
    />
  </svg>
);
const KeyboardIcon = () => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <path d="M6 10h0M9.5 10h0M13 10h0M16.5 10h0M6 13h0M16.5 13h0M9 13.5h6" />
  </svg>
);
const SettingsIcon = ({ active }: { active: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className={`${S()} transition-transform duration-300 ${
      active ? 'rotate-90' : ''
    }`}
    aria-hidden="true"
    {...stroke}
  >
    <path d="M4 8h8M17 8h3M4 16h3M12 16h8" />
    <circle cx="14" cy="8" r="2.2" />
    <circle cx="9" cy="16" r="2.2" />
  </svg>
);
const PipIcon = () => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <rect
      x="11.5"
      y="11"
      width="7"
      height="5"
      rx="1.2"
      fill="currentColor"
      stroke="none"
    />
  </svg>
);
const NextIcon = () => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <path d="M6 5l9 7-9 7z" fill="currentColor" />
    <path d="M18 5v14" />
  </svg>
);
const FullEnterIcon = () => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
  </svg>
);
const FullExitIcon = () => (
  <svg viewBox="0 0 24 24" className={S()} aria-hidden="true" {...stroke}>
    <path d="M9 4v3a2 2 0 0 1-2 2H4M15 4v3a2 2 0 0 0 2 2h3M9 20v-3a2 2 0 0 0-2-2H4M15 20v-3a2 2 0 0 1 2-2h3" />
  </svg>
);

// A control-bar icon button: 40px hit area, clear hover + press feedback.
const CtrlButton: React.FC<{
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}> = ({ label, onClick, children, active }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className={`grid h-10 w-10 place-items-center rounded-full transition duration-150 active:scale-90 ${
      active ? 'text-accent' : 'text-fg/85 hover:bg-fg/10 hover:text-fg'
    }`}
  >
    {children}
  </button>
);

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="inline-grid min-w-[1.6rem] place-items-center rounded-md border border-line/70 bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-fg shadow-sm">
    {children}
  </kbd>
);

const HlsPlayer: React.FC<HlsPlayerProps> = ({
  sources,
  qIdx,
  onQuality,
  provider,
  subtitles = [],
  onUseEmbed,
  onUnplayable,
  onNext,
  animeId,
  episode,
  total,
  skipMarkers,
  companionSlot,
  overlaySlot,
  controlsLocked,
  leaderName = 'someone',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  // The video region inside the stage. When the companion is docked in
  // fullscreen the stage becomes a flex row (video wrapper + dock), so all the
  // absolute overlays + caption-drag math anchor to THIS wrapper, not the stage,
  // and they line up with the shrunken video area instead of the full frame.
  const videoWrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const resumeTime = useRef(0);
  const wasPlaying = useRef(true);
  const onUnplayableRef = useRef(onUnplayable);
  onUnplayableRef.current = onUnplayable;

  const src = sources[qIdx]?.url;

  const initial = useRef<Prefs>(loadPrefs());
  const [skip, setSkip] = useState(initial.current.skip);
  const [rate, setRate] = useState(initial.current.rate);
  const [muted, setMuted] = useState(initial.current.muted);
  const [volume, setVolume] = useState(initial.current.volume);
  const [capSize, setCapSize] = useState(initial.current.capSize);
  const [capColor, setCapColor] = useState<CapColor>(initial.current.capColor);
  const [capBg, setCapBg] = useState<CapBg>(initial.current.capBg);
  const [subOffset, setSubOffset] = useState(initial.current.subOffset);
  const [capPos, setCapPos] = useState(initial.current.capPos);
  const [autoNext, setAutoNext] = useState(initial.current.autoNext);
  const [pinnedSubLangs, setPinnedSubLangs] = useState<string[]>(
    initial.current.pinnedSubLangs
  );
  const [subDefaultLang, setSubDefaultLang] = useState<string | null>(
    initial.current.subDefaultLang
  );
  const [capDragging, setCapDragging] = useState(false);
  const capDrag = useRef<{
    px: number;
    py: number;
    sx: number;
    sy: number;
    w: number;
    h: number;
  } | null>(null);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isFs, setIsFs] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const [settings, setSettings] = useState(false);
  // Subtitle picker is its own sub-page inside the settings sheet (the language list
  // can be long), so the main settings view stays uncluttered.
  const [subPanel, setSubPanel] = useState(false);
  const [help, setHelp] = useState(false);
  // Fullscreen companion dock (YouTube-theater). Only meaningful while
  // fullscreen; the toggle button is hidden otherwise.
  const [chatOpen, setChatOpen] = useState(false);
  // One-time "your companion is still here in fullscreen" cue on the dock toggle.
  const [showHint, setShowHint] = useState(false);
  const hintFired = useRef(false);
  const [subIdx, setSubIdx] = useState(-1);
  const [cueText, setCueText] = useState('');
  // Quality levels parsed from the HLS master (KAA returns ONE multi-rendition
  // master, so manual quality lives here, not in the parent's sources[]). manualLevel
  // -1 = Auto (hls.js ABR); hlsApiRef lets the picker switch level live.
  const [levels, setLevels] = useState<{ i: number; height: number }[]>([]);
  const [manualLevel, setManualLevel] = useState(-1);
  const hlsApiRef = useRef<{ setLevel: (i: number) => void } | null>(null);
  // The settings sheet always opens on its main view; close the subtitle sub-page
  // whenever the sheet itself closes.
  useEffect(() => {
    if (!settings) setSubPanel(false);
  }, [settings]);
  // Auto-next: dismissed for THIS episode, and a guard so we only advance once.
  const [autoNextDismissed, setAutoNextDismissed] = useState(false);
  const autoFiredRef = useRef(false);

  // Persist preferences whenever they change.
  useEffect(() => {
    try {
      const prefs: Prefs = {
        skip,
        rate,
        volume,
        muted,
        capSize,
        capColor,
        capBg,
        subOffset,
        capPos,
        autoNext,
        pinnedSubLangs,
        subDefaultLang,
      };
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [
    skip,
    rate,
    volume,
    muted,
    capSize,
    capColor,
    capBg,
    subOffset,
    capPos,
    autoNext,
    pinnedSubLangs,
    subDefaultLang,
  ]);

  // Auto-next: reset the per-episode guards whenever the episode changes.
  useEffect(() => {
    autoFiredRef.current = false;
    setAutoNextDismissed(false);
  }, [episode]);

  // Auto-next: advance once, right at the end, when enabled and not dismissed.
  useEffect(() => {
    if (!onNext || !autoNext || autoNextDismissed || autoFiredRef.current)
      return;
    if (duration > 0 && duration - current <= 0.6) {
      autoFiredRef.current = true;
      onNext();
    }
  }, [current, duration, onNext, autoNext, autoNextDismissed]);

  // ---- hls.js wiring (codec shim + media-error recovery + embed fallback) ----
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return undefined;

    patchAacMainCodec();
    let destroyed = false;
    let hls: { destroy: () => void } | null = null;
    let mediaRecover = 0;

    // Direct (non-HLS) sources — e.g. AllAnime's proxied MP4 (/file?…) — play
    // natively through the <video> element; hls.js only understands m3u8.
    const isHlsSrc = /\/hls\?|\.m3u8(\?|$)/i.test(src);
    if (!isHlsSrc) {
      video.src = src;
      const resumeNative = () => {
        if (resumeTime.current > 0) video.currentTime = resumeTime.current;
        if (wasPlaying.current) video.play().catch(() => undefined);
      };
      video.addEventListener('loadedmetadata', resumeNative, { once: true });
      video.addEventListener('error', () => onUnplayableRef.current(), {
        once: true,
      });
      return () => {
        destroyed = true;
        if (videoRef.current) {
          resumeTime.current = videoRef.current.currentTime;
          wasPlaying.current = !videoRef.current.paused;
        }
        video.removeAttribute('src');
        video.load();
      };
    }

    import('hls.js').then(({ default: Hls }) => {
      if (destroyed || !videoRef.current) return;
      const v = videoRef.current;
      const resume = () => {
        if (resumeTime.current > 0) v.currentTime = resumeTime.current;
        if (wasPlaying.current) v.play().catch(() => undefined);
      };
      // iPhone/iPod can only fullscreen the <video> via webkitEnterFullscreen,
      // and that path is reliable ONLY when Safari plays the HLS natively —
      // hls.js (ManagedMediaSource) breaks it. So on those devices prefer native
      // playback even though hls.js reports supported. Desktop / Android / iPad
      // keep hls.js (videoFsOnly is false there, native HLS unsupported anyway).
      const canNativeHls = !!v.canPlayType('application/vnd.apple.mpegurl');
      const preferNative = canNativeHls && videoFsOnly();

      // Attach hls.js (MSE / ManagedMediaSource). The primary path on
      // desktop + Android, and the iPhone fallback when the native player chokes
      // on a stream hls.js can still decode (see nativeFallback below).
      const startHls = () => {
        if (destroyed || !videoRef.current) return;
        const inst = new Hls({ enableWorker: true });
        inst.on(Hls.Events.BUFFER_CODECS, (_e, data) => {
          // eslint-disable-next-line no-console
          console.info('[hls] codecs', {
            video: data.video?.codec,
            audio: data.audio?.codec,
          });
        });
        inst.on(Hls.Events.MANIFEST_PARSED, () => {
          resume();
          // Surface the master's renditions for the manual quality picker (KAA's
          // single source is a multi-quality master; ABR runs until a manual pick).
          setLevels(inst.levels.map((l, i) => ({ i, height: l.height || 0 })));
          setManualLevel(inst.autoLevelEnabled ? -1 : inst.currentLevel);
        });
        inst.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
          setManualLevel(inst.autoLevelEnabled ? -1 : data.level);
        });
        hlsApiRef.current = {
          setLevel: (i: number) => {
            inst.currentLevel = i;
          },
        };
        inst.on(Hls.Events.ERROR, (_e, data) => {
          // eslint-disable-next-line no-console
          console.error(
            '[hls]',
            data.type,
            data.details,
            data.fatal ? 'FATAL' : ''
          );
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            inst.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            mediaRecover += 1;
            if (mediaRecover === 1) inst.recoverMediaError();
            else if (mediaRecover === 2) {
              inst.swapAudioCodec();
              inst.recoverMediaError();
            } else {
              inst.destroy();
              hls = null;
              onUnplayableRef.current();
            }
          } else {
            inst.destroy();
            hls = null;
            onUnplayableRef.current();
          }
        });
        inst.loadSource(src);
        inst.attachMedia(v);
        hls = inst;
      };

      if (Hls.isSupported() && !preferNative) {
        startHls();
      } else if (canNativeHls) {
        // iPhone: play through the native AVPlayer (the only path that supports
        // webkitEnterFullscreen + native captions). If it errors on a stream
        // hls.js can still decode (e.g. some demuxed multi-audio HLS), retry
        // once with hls.js before dropping to the embed fallback, so KAA still
        // plays (windowed; native fullscreen is unavailable under hls.js).
        let nativeRetried = false;
        const nativeFallback = () => {
          if (!nativeRetried && Hls.isSupported()) {
            nativeRetried = true;
            v.removeAttribute('src');
            v.load();
            startHls();
          } else {
            onUnplayableRef.current();
          }
        };
        v.src = src;
        v.addEventListener('loadedmetadata', resume, { once: true });
        v.addEventListener('error', nativeFallback, { once: true });
      }
    });

    return () => {
      destroyed = true;
      const v = videoRef.current;
      if (v) {
        resumeTime.current = v.currentTime;
        wasPlaying.current = !v.paused;
      }
      hlsApiRef.current = null;
      setLevels([]);
      setManualLevel(-1);
      if (hls) hls.destroy();
    };
  }, [src]);

  // ---- <video> -> state wiring (attach once) ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    v.volume = volume;
    v.muted = muted;
    v.playbackRate = rate;

    const onTime = () => setCurrent(v.currentTime);
    const onDur = () => setDuration(v.duration || 0);
    const onProg = () => {
      if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1));
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onWait = () => setWaiting(true);
    const onPlaying = () => setWaiting(false);
    const onVol = () => {
      setMuted(v.muted);
      setVolume(v.volume);
    };

    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('loadedmetadata', onDur);
    v.addEventListener('progress', onProg);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('waiting', onWait);
    v.addEventListener('playing', onPlaying);
    v.addEventListener('canplay', onPlaying);
    v.addEventListener('volumechange', onVol);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('loadedmetadata', onDur);
      v.removeEventListener('progress', onProg);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('waiting', onWait);
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('canplay', onPlaying);
      v.removeEventListener('volumechange', onVol);
    };
    // Run once per mount; live updates flow through the setters below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflect UI-driven rate / volume / muted onto the element.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, [rate]);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = volume;
    v.muted = muted;
  }, [volume, muted]);

  // Keep the chosen subtitle index in range as the track list changes.
  useEffect(() => {
    if (subIdx >= subtitles.length) setSubIdx(-1);
  }, [subtitles.length, subIdx]);

  // Auto-pick a subtitle once per source. Honors the remembered choice
  // (subDefaultLang) first, then a starred language; for raw / soft-sub providers
  // (KAA) with no burned-in subs it falls back to the first track so the viewer
  // isn't stuck with silent raw video. An explicit "Off" choice is respected.
  const subAutoSrc = useRef<string | null>(null);
  useEffect(() => {
    if (!src || subAutoSrc.current === src || !subtitles.length) return;
    subAutoSrc.current = src;
    if (subDefaultLang === 'off') return;
    const findLang = (lang: string): number =>
      subtitles.findIndex((s) => s.lang === lang);
    let target = -1;
    if (subDefaultLang) target = findLang(subDefaultLang);
    if (target < 0) {
      const pinned = pinnedSubLangs
        .map((lang) => findLang(lang))
        .find((idx) => idx >= 0);
      if (pinned !== undefined) target = pinned;
    }
    if (target < 0 && NO_HARDSUB.has(provider)) target = 0;
    if (target >= 0) setSubIdx(target);
  }, [src, subtitles, provider, subDefaultLang, pinnedSubLangs]);

  // Mirror subIdx into a ref so the identity-stable toggleFs (deps []) can read
  // the current selection when handing subtitles to the native iOS player.
  const subIdxRef = useRef(subIdx);
  useEffect(() => {
    subIdxRef.current = subIdx;
  }, [subIdx]);

  // ---- Watch progress ("Continue watching"). Persisted through the progress
  // module (`@utility/progress`, keyed by AniList id). The player remounts per
  // episode (the loading phase unmounts it), so seed the resume point on mount
  // and persist as it plays. ----
  useEffect(() => {
    if (!animeId || !episode) return;
    const e = getEntry(animeId);
    resumeTime.current = e && e.ep === episode && e.sec > 5 ? e.sec : 0;
  }, [animeId, episode]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !animeId || !episode) return undefined;
    let last = 0;
    const persist = () => {
      const t = v.currentTime;
      const dur = Math.floor(v.duration) || 0;
      // Within 90s of the end → treat as watched (drops it from "Continue watching").
      if (dur && dur - t < 90) {
        markWatched(animeId, episode, { total, dur });
      } else if (t > 5) {
        savePosition(animeId, { ep: episode, sec: Math.floor(t), dur, total });
      }
    };
    const onTime = () => {
      const now = Date.now();
      if (now - last < 5000) return; // throttle writes to ~once per 5s
      last = now;
      persist();
    };
    v.addEventListener('timeupdate', onTime);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      persist(); // final write on episode change / unmount
    };
  }, [animeId, episode, total]);

  // ---- Subtitles: drive the native TextTracks but render cues ourselves so the
  // styling (size / colour / background) is entirely user-controlled. ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    const tracks = v.textTracks;
    for (let i = 0; i < tracks.length; i += 1) {
      // The selected track is 'hidden' (we paint its cues ourselves). When
      // nothing is selected, keep the first track 'hidden' too so its cues stay
      // parsed for the companion's spoiler-safe grounding. 'hidden' parses cues
      // without ever displaying them, so this is invisible to the viewer.
      const groundOnly = subIdx < 0 && i === 0;
      tracks[i].mode = i === subIdx || groundOnly ? 'hidden' : 'disabled';
    }
    setCueText('');
    const t = subIdx >= 0 ? tracks[subIdx] : undefined;
    if (!t) return undefined;

    // Render the cue active at (currentTime + subOffset) by scanning the cue list
    // ourselves, so a user-set subtitle delay works even though the browser's
    // own activeCues are tied to the raw currentTime. Driven by both cuechange
    // (precise boundaries at offset 0) and timeupdate (covers the shifted case).
    const render = () => {
      const list = t.cues;
      if (!list || !list.length) {
        setCueText('');
        return;
      }
      const time = v.currentTime + subOffset;
      let text = '';
      for (let i = 0; i < list.length; i += 1) {
        const c = list[i] as VTTCue;
        if (c.startTime <= time && time < c.endTime) {
          text = text ? `${text}\n${c.text}` : c.text;
        }
      }
      setCueText(text);
    };

    t.addEventListener('cuechange', render);
    v.addEventListener('timeupdate', render);
    render();
    return () => {
      t.removeEventListener('cuechange', render);
      v.removeEventListener('timeupdate', render);
    };
  }, [subIdx, subtitles.length, src, subOffset]);

  // ---- AI companion grounding. Expose a spoiler-safe subtitle window: the lines
  // whose start time is at or before the current playback position. Reads the cue
  // list the browser already parsed and never returns a cue from the future, so
  // the companion can talk about this moment without spoiling what comes next.
  // Only the direct player registers; on embed the companion drops to episode level.
  useEffect(() => {
    registerAiredSource(() => {
      const v = videoRef.current;
      if (!v) return null;
      const tracks = v.textTracks;
      let cues: TextTrackCueList | null = null;
      if (subIdx >= 0 && tracks[subIdx]) cues = tracks[subIdx].cues;
      if (!cues || !cues.length) {
        for (let i = 0; i < tracks.length; i += 1) {
          if (tracks[i].cues && tracks[i].cues!.length) {
            cues = tracks[i].cues;
            break;
          }
        }
      }
      const now = v.currentTime;
      const items: { t: number; text: string }[] = [];
      if (cues) {
        for (let i = 0; i < cues.length; i += 1) {
          const c = cues[i] as VTTCue;
          if (c.startTime <= now) {
            const text = c.text
              .replace(/<[^>]+>/g, '')
              .replace(/\s+/g, ' ')
              .trim();
            if (text) items.push({ t: c.startTime, text });
          }
        }
      }
      items.sort((a, b) => a.t - b.t);
      return {
        lines: items.slice(-40).map((x) => x.text),
        current: now,
        duration: v.duration || 0,
      };
    });
    return () => registerAiredSource(null);
  }, [subIdx, subtitles.length]);

  // ---- Player bus. One handle for the whole mounted player: frame capture (the
  // companion's vision), imperative play/pause/seek, and re-emitted native
  // events (co-watch sync). Built once from the stable <video> node. Only the
  // direct player registers — on embed there is no handle and both features
  // gate themselves off. (Attach-once; the closed-over `v` is the same node for
  // this mount's life.) ----
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;

    // Tag events caused by our own play/pause/seek so sync consumers don't echo
    // a remote action back to the room. The media element fires play/pause/
    // seeked asynchronously, so a short time window is more reliable than a flag.
    let programmaticUntil = 0;
    const markProgrammatic = () => {
      programmaticUntil = performance.now() + 400;
    };
    const isProgrammatic = () => performance.now() < programmaticUntil;

    const captureFrame = (): string | null => {
      try {
        if (!v.videoWidth || !v.videoHeight) return null;
        const long = Math.max(v.videoWidth, v.videoHeight);
        const scale = long > 512 ? 512 / long : 1;
        const cw = Math.max(1, Math.round(v.videoWidth * scale));
        const ch = Math.max(1, Math.round(v.videoHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(v, 0, 0, cw, ch);
        return canvas.toDataURL('image/jpeg', 0.6);
      } catch {
        // Tainted canvas (a source without CORS) or frame not ready.
        return null;
      }
    };

    const handle: PlayerHandle = {
      captureFrame,
      play: () => {
        markProgrammatic();
        v.play().catch(() => undefined);
      },
      pause: () => {
        markProgrammatic();
        v.pause();
      },
      seek: (t) => {
        markProgrammatic();
        v.currentTime = Math.min(Math.max(t, 0), v.duration || t);
      },
      getCurrentTime: () => v.currentTime,
      isPaused: () => v.paused,
      on: (evt, cb) => subscribePlayerEvent(evt, cb),
    };

    const onBusPlay = () =>
      emitPlayerEvent('play', {
        time: v.currentTime,
        programmatic: isProgrammatic(),
      });
    const onBusPause = () =>
      emitPlayerEvent('pause', {
        time: v.currentTime,
        programmatic: isProgrammatic(),
      });
    const onBusSeek = () =>
      emitPlayerEvent('seek', {
        time: v.currentTime,
        programmatic: isProgrammatic(),
      });
    // Heartbeat for late-join re-anchoring; ~1Hz (sync itself is event-driven).
    let lastTick = 0;
    const onBusTick = () => {
      const now = performance.now();
      if (now - lastTick < 900) return;
      lastTick = now;
      emitPlayerEvent('timeupdate', {
        time: v.currentTime,
        programmatic: false,
      });
    };

    v.addEventListener('play', onBusPlay);
    v.addEventListener('pause', onBusPause);
    v.addEventListener('seeked', onBusSeek);
    v.addEventListener('timeupdate', onBusTick);
    registerPlayerHandle(handle);
    return () => {
      v.removeEventListener('play', onBusPlay);
      v.removeEventListener('pause', onBusPause);
      v.removeEventListener('seeked', onBusSeek);
      v.removeEventListener('timeupdate', onBusTick);
      registerPlayerHandle(null);
    };
    // Attach once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-time fullscreen hint: the first time the viewer is fullscreen with a
  // companion available (and the dock closed), pulse the dock toggle and float a
  // short tip, then never again. Persisted so it survives reloads.
  useEffect(() => {
    if (hintFired.current) return undefined;
    if (!isFs || !companionSlot || chatOpen) return undefined;
    let seen = false;
    try {
      seen = Boolean(window.localStorage.getItem(HINT_KEY));
    } catch {
      /* ignore */
    }
    hintFired.current = true;
    if (seen) return undefined;
    try {
      window.localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* ignore */
    }
    setShowHint(true);
    const id = setTimeout(() => setShowHint(false), 5200);
    return () => clearTimeout(id);
  }, [isFs, chatOpen, companionSlot]);

  // Fullscreen state sync. Refocus the stage on enter so keyboard keeps working.
  useEffect(() => {
    const onFs = () => {
      const fs = document.fullscreenElement === stageRef.current;
      setIsFs(fs);
      if (fs) stageRef.current?.focus();
      // Mobile: rotate to landscape in fullscreen, release on exit (YouTube
      // style). The Screen Orientation lock is Android/Chromium — it rejects on
      // desktop + iPadOS, which we swallow. iPhone never reaches here (it uses
      // webkitEnterFullscreen and the OS auto-rotates its native player).
      const orientation = window.screen.orientation as ScreenOrientation & {
        lock?: (o: 'landscape') => Promise<void>;
        unlock?: () => void;
      };
      if (fs) orientation?.lock?.('landscape').catch(() => undefined);
      else orientation?.unlock?.();
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Follower lock: read through a ref so the gated callbacks stay identity-stable
  // (no dep churn, no stale closure). Only the user-facing playback gestures
  // consult this; the player handle's play/pause/seek (the sync engine's path)
  // is deliberately NOT gated, so remote state keeps applying to a follower.
  const lockedRef = useRef(false);
  useEffect(() => {
    lockedRef.current = !!controlsLocked;
  }, [controlsLocked]);

  // ---- actions ----
  const togglePlay = useCallback(() => {
    if (lockedRef.current) return; // follower: leader drives play/pause
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => undefined);
    else v.pause();
  }, []);
  const seekBy = useCallback((d: number) => {
    if (lockedRef.current) return; // follower: leader drives seeking
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(v.currentTime + d, 0), v.duration || 0);
  }, []);
  const toggleFs = useCallback(() => {
    const v = videoRef.current as
      | (HTMLVideoElement & { webkitEnterFullscreen?: () => void })
      | null;
    // iPhone/iPod: no element-level Fullscreen API exists, so only the <video>
    // itself can go fullscreen, via the webkit-prefixed call. Hand off straight
    // to the native iOS player (a stray no-op requestFullscreen must not swallow
    // this). Native controls take over, so the companion dock isn't available
    // there — but the video actually fills the screen.
    if (videoFsOnly() && v?.webkitEnterFullscreen) {
      // The native player covers our DOM caption layer, and we keep the chosen
      // track 'hidden' (we paint cues ourselves). Flip it to 'showing' so the
      // native player renders subs, then restore our own rendering on close.
      const idx = subIdxRef.current;
      const track = idx >= 0 ? v.textTracks[idx] : undefined;
      if (track) {
        track.mode = 'showing';
        v.addEventListener(
          'webkitendfullscreen',
          () => {
            track.mode = 'hidden';
          },
          { once: true }
        );
      }
      v.webkitEnterFullscreen();
      return;
    }
    // Standard Fullscreen API — desktop + Android + iPad (keeps our chrome).
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (stageRef.current?.requestFullscreen) {
      stageRef.current.requestFullscreen().catch(() => undefined);
    }
  }, []);
  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !document.pictureInPictureEnabled) return;
    try {
      if (document.pictureInPictureElement)
        await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      /* ignore */
    }
  }, []);
  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (v) v.muted = !v.muted;
  }, []);
  // The preferred track when turning captions on: remembered lang, else a starred
  // lang, else the first track.
  const preferredSubIdx = useCallback((): number => {
    if (!subtitles.length) return -1;
    const findLang = (lang: string): number =>
      subtitles.findIndex((s) => s.lang === lang);
    if (subDefaultLang && subDefaultLang !== 'off') {
      const d = findLang(subDefaultLang);
      if (d >= 0) return d;
    }
    const pinned = pinnedSubLangs
      .map((lang) => findLang(lang))
      .find((idx) => idx >= 0);
    return pinned !== undefined ? pinned : 0;
  }, [subtitles, subDefaultLang, pinnedSubLangs]);

  // Picking a track from the menu also remembers it as the default, so the accurate
  // track the viewer chooses becomes the auto-pick on later episodes.
  const chooseSub = useCallback(
    (i: number) => {
      setSubIdx(i);
      setSubDefaultLang(i < 0 ? 'off' : subtitles[i]?.lang ?? null);
    },
    [subtitles]
  );

  // Star / unstar a subtitle language: starred langs sort to the top of the picker.
  const togglePin = useCallback((lang: string) => {
    setPinnedSubLangs((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  }, []);

  const toggleCaptions = useCallback(() => {
    if (!subtitles.length) return;
    setSubIdx((i) => (i >= 0 ? -1 : preferredSubIdx()));
  }, [subtitles.length, preferredSubIdx]);

  // Auto-hide chrome after inactivity while playing.
  const poke = useCallback(() => {
    setShowUi(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (!videoRef.current?.paused && !settings && !help) setShowUi(false);
    }, HIDE_MS);
  }, [settings, help]);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    []
  );

  const chromeVisible = showUi || !playing || settings || help;
  // The companion dock only docks while fullscreen, toggled on, and present.
  const showDock = Boolean(isFs && chatOpen && companionSlot);

  // ---- scrubbing ----
  const seekToClientX = useCallback((clientX: number) => {
    if (lockedRef.current) return; // follower: scrubber is locked
    const v = videoRef.current;
    const el = trackRef.current;
    if (!v || !el || !v.duration) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.min(Math.max((clientX - r.left) / r.width, 0), 1);
    v.currentTime = ratio * v.duration;
    setCurrent(v.currentTime);
  }, []);
  const onTrackDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seekToClientX(e.clientX);
  };
  const onTrackMove = (e: ReactPointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      seekToClientX(e.clientX);
  };

  // ---- keyboard ----
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setHelp(false);
      setSettings(false);
      return;
    }
    if (e.key === '?') {
      e.preventDefault();
      setHelp((h) => !h);
      return;
    }
    // Let the volume range handle its own arrows when it has keyboard focus.
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const map: Record<string, () => void> = {
      ' ': togglePlay,
      k: togglePlay,
      ArrowLeft: () => seekBy(-skip),
      j: () => seekBy(-skip),
      ArrowRight: () => seekBy(skip),
      l: () => seekBy(skip),
      ArrowUp: () => setVolume((x) => Math.min(1, +(x + 0.1).toFixed(2))),
      ArrowDown: () => setVolume((x) => Math.max(0, +(x - 0.1).toFixed(2))),
      m: toggleMute,
      c: toggleCaptions,
      f: toggleFs,
      p: togglePip,
      // Next episode is a leader-only action; a follower's `n` does nothing.
      n: () => {
        if (lockedRef.current) return;
        onNext?.();
      },
    };
    const fn = map[e.key];
    if (fn) {
      e.preventDefault();
      poke();
      fn();
    } else if (/^[0-9]$/.test(e.key)) {
      if (lockedRef.current) return; // follower: number-key seek is locked
      const v = videoRef.current;
      if (v && v.duration) {
        e.preventDefault();
        v.currentTime = (Number(e.key) / 10) * v.duration;
      }
    }
  };

  const pct = duration ? (current / duration) * 100 : 0;
  const bufPct = duration ? (buffered / duration) * 100 : 0;
  const hasSubs = subtitles.length > 0;

  // Subtitle list ordered with starred languages first (stable within each group),
  // keeping each track's real index for selection.
  const orderedSubs = subtitles
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ra = pinnedSubLangs.indexOf(a.s.lang);
      const rb = pinnedSubLangs.indexOf(b.s.lang);
      return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
    });

  const menuChip = (label: string, on: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex min-h-[40px] items-center justify-center rounded-full px-3 text-xs font-semibold transition [touch-action:manipulation] ${
        on
          ? 'bg-aurora text-accent-ink shadow-glow'
          : 'text-muted hover:bg-surface-2 hover:text-fg'
      }`}
    >
      {label}
    </button>
  );

  // Drag the caption box anywhere over the video (YouTube-style); position is a
  // percentage of the stage so it survives resize / fullscreen, and persists.
  const onCapDown = (e: ReactPointerEvent) => {
    const stage = videoWrapRef.current ?? stageRef.current;
    if (!stage) return;
    e.stopPropagation();
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    const start = capPos ?? { x: 50, y: 84 };
    capDrag.current = {
      px: e.clientX,
      py: e.clientY,
      sx: start.x,
      sy: start.y,
      w: r.width || 1,
      h: r.height || 1,
    };
    setCapDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onCapMove = (e: ReactPointerEvent) => {
    const d = capDrag.current;
    if (!d) return;
    const clamp = (v: number) => Math.min(95, Math.max(5, v));
    setCapPos({
      x: clamp(d.sx + ((e.clientX - d.px) / d.w) * 100),
      y: clamp(d.sy + ((e.clientY - d.py) / d.h) * 100),
    });
  };
  const onCapUp = (e: ReactPointerEvent) => {
    capDrag.current = null;
    setCapDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  // Which AniSkip marker (if any) covers the current playback time. Drives the
  // "Skip Intro / Skip Outro" button; clicking jumps to the end of the segment.
  const activeSkip = (() => {
    if (!skipMarkers) return null;
    const { op, ed } = skipMarkers;
    if (op && current >= op.start && current < op.end - 0.25)
      return { label: 'Skip Intro', end: op.end };
    if (ed && current >= ed.start && current < ed.end - 0.25)
      return { label: 'Skip Outro', end: ed.end };
    return null;
  })();

  const skipTo = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(t, 0), v.duration || t);
    setCurrent(v.currentTime);
  };

  // "Up next" countdown card — shows in the final seconds when auto-next is on
  // and a next episode exists. The count is derived from playback time, so it
  // naturally freezes if the viewer pauses.
  const nextRemaining = duration > 0 ? duration - current : Infinity;
  const showUpNext =
    Boolean(onNext) &&
    autoNext &&
    !autoNextDismissed &&
    nextRemaining <= 9 &&
    nextRemaining > 0;

  const shortcuts: [string[], string][] = [
    [['Space', 'K'], 'Play / pause'],
    [['J', '←'], `Back ${skip}s`],
    [['L', '→'], `Forward ${skip}s`],
    [['↑', '↓'], 'Volume'],
    [['M'], 'Mute'],
    [['C'], 'Subtitles'],
    [['F'], 'Fullscreen'],
    [['P'], 'Picture in picture'],
    [['N'], 'Next episode'],
    [['0', '–', '9'], 'Jump to %'],
    [['?'], 'This guide'],
  ];

  return (
    <div className="space-y-2.5">
      <div className="aspect-w-16 aspect-h-9 w-full overflow-hidden rounded-2xl bg-black shadow-card ring-1 ring-line/40">
        {/* The aspect plugin makes this single child absolute inset-0 — it is our
            stage + the fullscreen target. */}
        <div
          ref={stageRef}
          tabIndex={0}
          role="group"
          aria-label="Video player"
          onKeyDown={onKey}
          onPointerDown={() => stageRef.current?.focus()}
          onPointerMove={poke}
          onPointerLeave={() =>
            playing && !settings && !help && setShowUi(false)
          }
          className={`bg-black outline-none ${showDock ? 'flex' : ''} ${
            chromeVisible ? '' : 'cursor-none'
          }`}
        >
          {/* Video region: the positioning context for every overlay + caption.
              It is the full stage normally, and flex-1 (the room left of the
              dock) when the companion is docked in fullscreen. container-type
              lets the caption layer size itself in `cqw` (1% of this region's
              width), so captions scale with the visible video, dock or not.
              (cast: containerType predates this csstype version.) */}
          <div
            ref={videoWrapRef}
            style={{ containerType: 'inline-size' } as React.CSSProperties}
            className="group relative h-full min-w-0 flex-1 bg-black"
          >
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              crossOrigin="anonymous"
              onClick={togglePlay}
              onDoubleClick={toggleFs}
              className="absolute inset-0 h-full w-full bg-black object-contain"
            >
              {subtitles.map((s) => (
                <track
                  key={s.url}
                  kind="subtitles"
                  src={s.url}
                  srcLang={s.lang}
                  label={s.label || s.lang}
                />
              ))}
            </video>

            {/* Follower lock indicator. A calm, legible chip over the video
              (top-left) telling the viewer the leader holds the remote. Lives
              inside the video region so it tracks the picture in fullscreen too.
              No alarming animation — the corner cue plus the dimmed controls say
              it all. Only rendered for a follower; the leader / solo viewer
              never sees it. */}
            {controlsLocked && (
              <div className="pointer-events-none absolute left-3 top-3 z-30 inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-canvas/70 px-2.5 py-1 text-[11px] font-medium text-muted backdrop-blur">
                <span role="img" aria-label="Leader">
                  👑
                </span>
                <span>{leaderName} has the remote</span>
              </div>
            )}

            {/* On-video overlay (danmaku + reaction floaties). Sits above the
              video, below the caption layer (z-30) and the controls. The layer
              itself never eats pointer events; the slot opts specific controls in. */}
            {overlaySlot && (
              <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
                {overlaySlot}
              </div>
            )}

            {/* Our own caption layer (native rendering is suppressed to 'hidden').
              The box stays mounted whenever subtitles are on — even between lines —
              so a drag survives cue-text changes; it sits above the controls (z-30)
              so it's grabbable while paused. When paused on a gap (no current line) a
              small handle appears so captions can still be repositioned anytime.
              Default position is bottom-centre. */}
            {subIdx >= 0 && (
              <div className="pointer-events-none absolute inset-0 z-30">
                <span
                  onPointerDown={onCapDown}
                  onPointerMove={onCapMove}
                  onPointerUp={onCapUp}
                  className={`pointer-events-auto absolute max-w-[90%] touch-none select-none text-center font-semibold leading-snug ${
                    capDragging ? 'cursor-grabbing' : 'cursor-grab'
                  }`}
                  style={{
                    ...(capPos
                      ? {
                          left: `${capPos.x}%`,
                          top: `${capPos.y}%`,
                          transform: 'translate(-50%, -50%)',
                        }
                      : {
                          left: '50%',
                          bottom: chromeVisible ? '16%' : '7%',
                          transform: 'translateX(-50%)',
                          transition: 'bottom 0.2s ease',
                        }),
                    fontSize:
                      CAP_SIZES.find((c) => c.k === capSize)?.css ??
                      CAP_SIZES[1].css,
                    whiteSpace: 'pre-line',
                    color: capColor === 'yellow' ? '#F2D43D' : '#F6F6F8',
                    // Background/shadow only when there's text — keep the box invisible
                    // (and unobtrusive) between lines.
                    ...(cueText
                      ? {
                          background: CAP_BG[capBg],
                          padding: capBg === 'none' ? 0 : '0.12em 0.5em',
                          borderRadius: 8,
                          textShadow:
                            capBg === 'none'
                              ? '0 1px 3px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.95)'
                              : 'none',
                        }
                      : null),
                  }}
                >
                  {cueText ||
                    (!playing && (
                      <span className="bg-black/55 inline-block whitespace-nowrap rounded-md border border-dashed border-white/40 px-2 py-0.5 text-xs font-medium text-white/75">
                        ↔ drag to move captions
                      </span>
                    ))}
                </span>
              </div>
            )}

            {/* Buffering */}
            {waiting && (
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="h-11 w-11 animate-spin rounded-full border-[3px] border-fg/20 border-t-accent" />
              </div>
            )}

            {/* Center play when paused. For a follower the leader drives play,
              so a tap here would do nothing and feel broken — render a calm,
              non-interactive paused glyph instead (the corner chip explains why). */}
            {!playing &&
              !waiting &&
              (controlsLocked ? (
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="grid h-[68px] w-[68px] place-items-center rounded-full border border-line/60 bg-canvas/70 text-muted backdrop-blur">
                    <PlayIcon className="ml-0.5 h-8 w-8 opacity-60" />
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  aria-label="Play"
                  onClick={togglePlay}
                  className="absolute inset-0 grid place-items-center"
                >
                  <span className="grid h-[68px] w-[68px] place-items-center rounded-full bg-aurora text-accent-ink shadow-glow transition duration-200 hover:scale-105 active:scale-95">
                    <PlayIcon className="ml-0.5 h-8 w-8" />
                  </span>
                </button>
              ))}

            {/* Keyboard shortcuts overlay */}
            {help && (
              <div className="absolute inset-0 z-30 grid place-items-center bg-canvas/80 px-4 backdrop-blur-sm">
                <div className="w-full max-w-md rounded-2xl border border-line/60 bg-canvas-2/95 p-5 shadow-lift">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="font-display text-sm font-bold text-fg">
                      Keyboard shortcuts
                    </h3>
                    <button
                      type="button"
                      onClick={() => setHelp(false)}
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-faint hover:text-fg"
                    >
                      Close
                    </button>
                  </div>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                    {shortcuts.map(([keys, label]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between gap-3"
                      >
                        <dt className="flex items-center gap-1">
                          {keys.map((key) => (
                            <Kbd key={key}>{key}</Kbd>
                          ))}
                        </dt>
                        <dd className="text-xs text-muted">{label}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            )}

            {/* Skip intro / outro (AniSkip). Sits above the control scrim, lifts a
              little when the chrome is visible so it never overlaps the bar.
              Hidden for a follower — skipping is a seek, and only the leader
              drives playback. */}
            {activeSkip && !help && !showUpNext && !controlsLocked && (
              <button
                type="button"
                onClick={() => skipTo(activeSkip.end)}
                className={`bg-canvas/85 absolute right-4 z-30 flex items-center gap-2 rounded-lg border border-line/60 px-4 py-2 text-sm font-semibold text-fg shadow-lift backdrop-blur transition hover:border-accent/60 hover:text-accent active:scale-95 sm:right-6 ${
                  chromeVisible ? 'bottom-24' : 'bottom-8'
                }`}
              >
                {activeSkip.label}
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 5l7 7-7 7M13 5l7 7-7 7" />
                </svg>
              </button>
            )}

            {/* Up next — auto-play countdown in the final seconds. Hidden for a
              follower: advancing the episode is the leader's call, and the room
              syncs the follower forward anyway. */}
            {showUpNext && !help && !controlsLocked && (
              <div
                className={`absolute right-4 z-30 w-56 rounded-xl border border-line/60 bg-canvas/90 p-3 shadow-lift backdrop-blur sm:right-6 ${
                  chromeVisible ? 'bottom-24' : 'bottom-8'
                }`}
              >
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-faint">
                  Up next
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-fg">
                  Episode {(episode ?? 0) + 1}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Playing in {Math.ceil(nextRemaining)}s
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onNext?.()}
                    className="flex-1 rounded-lg bg-aurora px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-glow transition active:scale-95"
                  >
                    Play now
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoNextDismissed(true)}
                    className="rounded-lg border border-line/60 px-3 py-1.5 text-xs font-medium text-muted transition hover:text-fg"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Bottom scrim + controls */}
            <div
              className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-canvas/95 via-canvas/40 to-transparent pb-2 pt-10 transition-opacity duration-300 ${
                chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
            >
              {/* Scrubber */}
              <div className="px-3">
                <div
                  ref={trackRef}
                  role="slider"
                  tabIndex={-1}
                  aria-label="Seek"
                  aria-valuemin={0}
                  aria-valuemax={Math.floor(duration)}
                  aria-valuenow={Math.floor(current)}
                  onPointerDown={onTrackDown}
                  onPointerMove={onTrackMove}
                  className={`group/sb relative flex h-4 items-center ${
                    controlsLocked
                      ? 'pointer-events-none cursor-not-allowed opacity-40'
                      : 'cursor-pointer'
                  }`}
                >
                  <div className="absolute inset-x-0 h-1 overflow-hidden rounded-full bg-fg/20">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-fg/25"
                      style={{ width: `${bufPct}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-accent"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div
                    className="group-hover/sb:opacity-100 absolute h-3 w-3 -translate-x-1/2 rounded-full bg-accent opacity-0 shadow-glow transition-opacity"
                    style={{ left: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-1 px-2 sm:gap-0.5">
                {/* Play/pause. For a follower this is dimmed + a no-op (togglePlay
                  self-gates); the title says who actually holds the remote. We
                  keep it hoverable (no pointer-events-none on the wrapper) so the
                  tooltip explains the lock. */}
                <span
                  className={
                    controlsLocked ? 'cursor-not-allowed opacity-40' : ''
                  }
                  title={
                    controlsLocked
                      ? `${leaderName} has the remote. Only they can hit play.`
                      : undefined
                  }
                >
                  <CtrlButton
                    label={playing ? 'Pause' : 'Play'}
                    onClick={togglePlay}
                  >
                    {playing ? <PauseIcon /> : <PlayIcon />}
                  </CtrlButton>
                </span>
                {onNext && (
                  <span
                    className={`hidden sm:block ${
                      controlsLocked
                        ? 'pointer-events-none cursor-not-allowed opacity-40'
                        : ''
                    }`}
                  >
                    <CtrlButton
                      label="Next episode (n)"
                      onClick={() => {
                        if (controlsLocked) return;
                        onNext();
                      }}
                    >
                      <NextIcon />
                    </CtrlButton>
                  </span>
                )}
                <span
                  className={
                    controlsLocked
                      ? 'pointer-events-none cursor-not-allowed opacity-40'
                      : ''
                  }
                >
                  <CtrlButton
                    label={`Back ${skip}s`}
                    onClick={() => seekBy(-skip)}
                  >
                    <SkipBackIcon seconds={skip} />
                  </CtrlButton>
                </span>
                <span
                  className={
                    controlsLocked
                      ? 'pointer-events-none cursor-not-allowed opacity-40'
                      : ''
                  }
                >
                  <CtrlButton
                    label={`Forward ${skip}s`}
                    onClick={() => seekBy(skip)}
                  >
                    <SkipFwdIcon seconds={skip} />
                  </CtrlButton>
                </span>

                <div className="hidden items-center sm:flex">
                  <CtrlButton
                    label={muted ? 'Unmute' : 'Mute'}
                    onClick={toggleMute}
                  >
                    <VolumeIcon muted={muted || volume === 0} />
                  </CtrlButton>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    aria-label="Volume"
                    value={muted ? 0 : volume}
                    onChange={(e) => {
                      setVolume(Number(e.target.value));
                      setMuted(false);
                    }}
                    className="ml-0.5 hidden h-1 w-16 cursor-pointer accent-accent sm:block"
                  />
                </div>

                <span className="ml-1 select-none whitespace-nowrap text-xs font-medium tabular-nums text-fg/90">
                  {fmt(current)}
                  <span className="text-fg/45"> / {fmt(duration)}</span>
                </span>

                <div className="flex-1" />

                <span className="hidden sm:block">
                  <CtrlButton
                    label="Keyboard shortcuts (?)"
                    onClick={() => setHelp((h) => !h)}
                  >
                    <KeyboardIcon />
                  </CtrlButton>
                </span>

                {hasSubs && (
                  <CtrlButton
                    label={subIdx >= 0 ? 'Subtitles on' : 'Subtitles off'}
                    active={subIdx >= 0}
                    onClick={toggleCaptions}
                  >
                    <CcIcon active={subIdx >= 0} />
                  </CtrlButton>
                )}

                {/* Settings popover */}
                <div className="relative">
                  <CtrlButton
                    label="Settings"
                    active={settings}
                    onClick={() => setSettings((s) => !s)}
                  >
                    <SettingsIcon active={settings} />
                  </CtrlButton>
                  {settings && (
                    <>
                      <button
                        type="button"
                        aria-label="Close settings"
                        tabIndex={-1}
                        onClick={() => setSettings(false)}
                        className="fixed inset-0 z-10 cursor-default"
                      />
                      <div className="absolute bottom-full right-0 z-20 mb-2 max-h-[60svh] w-60 max-w-[calc(100vw-1.5rem)] space-y-3 overflow-y-auto rounded-xl border border-line/60 bg-canvas-2/95 p-3 shadow-lift backdrop-blur-md">
                        {!subPanel && (
                          <>
                            {sources.length > 1 && (
                              <div>
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                                  Quality
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {sources.map((s, i) =>
                                    menuChip(
                                      s.quality || 'auto',
                                      i === qIdx,
                                      () => onQuality(i)
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                            {sources.length <= 1 && levels.length > 1 && (
                              <div>
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                                  Quality
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {menuChip('Auto', manualLevel < 0, () => {
                                    setManualLevel(-1);
                                    hlsApiRef.current?.setLevel(-1);
                                  })}
                                  {[...levels]
                                    .sort((a, b) => b.height - a.height)
                                    .map((l) =>
                                      menuChip(
                                        l.height
                                          ? `${l.height}p`
                                          : `#${l.i + 1}`,
                                        manualLevel === l.i,
                                        () => {
                                          setManualLevel(l.i);
                                          hlsApiRef.current?.setLevel(l.i);
                                        }
                                      )
                                    )}
                                </div>
                              </div>
                            )}
                            <div>
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                                Speed
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {SPEEDS.map((sp) =>
                                  menuChip(
                                    sp === 1 ? '1x' : `${sp}x`,
                                    sp === rate,
                                    () => setRate(sp)
                                  )
                                )}
                              </div>
                            </div>
                            <div>
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                                Skip interval
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {SKIPS.map((sk) =>
                                  menuChip(`${sk}s`, sk === skip, () =>
                                    setSkip(sk)
                                  )
                                )}
                              </div>
                            </div>
                            <div>
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                                Autoplay next
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {menuChip('On', autoNext, () =>
                                  setAutoNext(true)
                                )}
                                {menuChip('Off', !autoNext, () =>
                                  setAutoNext(false)
                                )}
                              </div>
                            </div>
                            {hasSubs ? (
                              <button
                                type="button"
                                onClick={() => setSubPanel(true)}
                                className="flex w-full items-center justify-between gap-2 rounded-lg border border-line/50 px-2.5 py-2 text-left transition hover:bg-surface-2"
                              >
                                <span className="flex flex-col">
                                  <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                                    Subtitles
                                  </span>
                                  <span className="text-xs font-semibold text-fg">
                                    {subIdx >= 0
                                      ? subtitles[subIdx]?.label ||
                                        subtitles[subIdx]?.lang
                                      : 'Off'}
                                  </span>
                                </span>
                                <span
                                  aria-hidden
                                  className="text-base text-faint"
                                >
                                  ›
                                </span>
                              </button>
                            ) : (
                              <p className="border-t border-line/40 pt-2.5 text-[11px] leading-relaxed text-faint">
                                No subtitles for this source yet.
                              </p>
                            )}
                          </>
                        )}
                        {subPanel && hasSubs && (
                          <div className="space-y-2">
                            <button
                              type="button"
                              onClick={() => setSubPanel(false)}
                              className="-ml-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-muted transition hover:text-fg"
                            >
                              <span aria-hidden className="text-base">
                                ‹
                              </span>
                              Subtitles
                            </button>
                            <div className="space-y-2 border-t border-line/40 pt-2.5">
                              <div>
                                <div className="flex flex-col gap-1">
                                  <button
                                    type="button"
                                    onClick={() => chooseSub(-1)}
                                    aria-pressed={subIdx < 0}
                                    className={`flex min-h-[44px] items-center rounded-lg px-2.5 text-left text-xs font-semibold transition [touch-action:manipulation] ${
                                      subIdx < 0
                                        ? 'bg-aurora text-accent-ink shadow-glow'
                                        : 'text-muted hover:bg-surface-2 hover:text-fg'
                                    }`}
                                  >
                                    Off
                                  </button>
                                  {orderedSubs.map(({ s, i }) => {
                                    const pinned = pinnedSubLangs.includes(
                                      s.lang
                                    );
                                    const name = s.label || s.lang;
                                    return (
                                      <div
                                        key={i}
                                        className="flex items-center gap-2"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => chooseSub(i)}
                                          aria-pressed={subIdx === i}
                                          className={`flex min-h-[44px] flex-1 items-center rounded-lg px-2.5 text-left text-xs font-semibold transition [touch-action:manipulation] ${
                                            subIdx === i
                                              ? 'bg-aurora text-accent-ink shadow-glow'
                                              : 'text-muted hover:bg-surface-2 hover:text-fg'
                                          }`}
                                        >
                                          {name}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => togglePin(s.lang)}
                                          aria-pressed={pinned}
                                          aria-label={`${
                                            pinned ? 'Unstar' : 'Star'
                                          } ${name}`}
                                          title={
                                            pinned
                                              ? 'Unstar (unpin from top)'
                                              : 'Star (pin to top)'
                                          }
                                          className={`grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-md text-base leading-none transition [touch-action:manipulation] ${
                                            pinned
                                              ? 'text-amber-300'
                                              : 'text-muted hover:text-fg'
                                          }`}
                                        >
                                          {pinned ? '★' : '☆'}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              {subIdx >= 0 && (
                                <div>
                                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                                    Subtitle delay
                                  </p>
                                  <div className="flex items-center gap-1.5">
                                    {menuChip('-0.5s', false, () =>
                                      setSubOffset((o) =>
                                        Math.max(
                                          -60,
                                          Math.round((o - 0.5) * 10) / 10
                                        )
                                      )
                                    )}
                                    <span className="min-w-[3.25rem] text-center text-xs font-semibold tabular-nums text-fg">
                                      {subOffset > 0 ? '+' : ''}
                                      {subOffset.toFixed(1)}s
                                    </span>
                                    {menuChip('+0.5s', false, () =>
                                      setSubOffset((o) =>
                                        Math.min(
                                          60,
                                          Math.round((o + 0.5) * 10) / 10
                                        )
                                      )
                                    )}
                                    {subOffset !== 0 &&
                                      menuChip('Reset', false, () =>
                                        setSubOffset(0)
                                      )}
                                  </div>
                                </div>
                              )}
                              <div>
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                                  Caption size
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {CAP_SIZES.map((c) =>
                                    menuChip(c.k, capSize === c.k, () =>
                                      setCapSize(c.k)
                                    )
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                                  Caption colour
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {menuChip('White', capColor === 'white', () =>
                                    setCapColor('white')
                                  )}
                                  {menuChip(
                                    'Yellow',
                                    capColor === 'yellow',
                                    () => setCapColor('yellow')
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                                  Caption background
                                </p>
                                <div className="flex flex-wrap gap-1">
                                  {menuChip('Solid', capBg === 'solid', () =>
                                    setCapBg('solid')
                                  )}
                                  {menuChip('Dim', capBg === 'semi', () =>
                                    setCapBg('semi')
                                  )}
                                  {menuChip('None', capBg === 'none', () =>
                                    setCapBg('none')
                                  )}
                                </div>
                              </div>
                              <div>
                                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-faint">
                                  Caption position
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                  {capPos
                                    ? menuChip('Reset to bottom', false, () =>
                                        setCapPos(null)
                                      )
                                    : null}
                                  <span className="text-[11px] text-faint">
                                    Drag the caption to move it
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <span className="hidden sm:block">
                  <CtrlButton label="Picture in picture" onClick={togglePip}>
                    <PipIcon />
                  </CtrlButton>
                </span>

                {/* Companion dock toggle — only useful in fullscreen, where the
                  page right-rail isn't visible. Off fullscreen the companion
                  lives in the right-rail tab, so we hide this. A one-time hint
                  pulses here on first fullscreen so the dock gets discovered. */}
                {companionSlot && isFs && (
                  <div className="relative">
                    {showHint && (
                      <div
                        role="status"
                        className="absolute bottom-full right-0 z-30 mb-3 w-56 animate-rise rounded-xl border border-accent/40 bg-canvas-2/95 p-3 text-left shadow-lift backdrop-blur-md"
                      >
                        <p className="text-sm font-semibold text-fg">
                          Still here, side stage
                        </p>
                        <p className="mt-0.5 text-xs leading-relaxed text-muted">
                          Fullscreen and all. Your companion and the watch party
                          are one tap away.
                        </p>
                        <span className="absolute right-5 top-full -mt-px h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-b border-r border-accent/40 bg-canvas-2" />
                      </div>
                    )}
                    {showHint && (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-1 animate-ping rounded-full bg-accent/40"
                      />
                    )}
                    <CtrlButton
                      label={chatOpen ? 'Hide side panel' : 'Show side panel'}
                      active={chatOpen || showHint}
                      onClick={() => {
                        setChatOpen((c) => !c);
                        setShowHint(false);
                      }}
                    >
                      <ChatAlt2Icon className="h-[22px] w-[22px]" />
                    </CtrlButton>
                  </div>
                )}

                <CtrlButton
                  label={isFs ? 'Exit fullscreen' : 'Fullscreen'}
                  onClick={toggleFs}
                >
                  {isFs ? <FullExitIcon /> : <FullEnterIcon />}
                </CtrlButton>
              </div>
            </div>
          </div>

          {/* Companion dock (YouTube-theater). Lives INSIDE the fullscreen
              element so it shows over the video while fullscreen; the video
              region (flex-1, above) shrinks to keep the whole frame visible
              beside it. Scrolls internally and is full stage height. */}
          {showDock && (
            <aside
              aria-label="Companion and watch party"
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              className="flex h-full w-[22rem] shrink-0 flex-col border-l border-line/60 bg-canvas-2/95 backdrop-blur sm:w-[24rem]"
            >
              {companionSlot}
            </aside>
          )}
        </div>
      </div>

      {/* Meta row below the player: source badge + embed escape hatch. */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-aurora px-2.5 py-1 font-semibold text-accent-ink shadow-glow">
          <PlayIcon className="h-3 w-3" />
          our player{provider ? ` · ${provider}` : ''}
        </span>
        <button
          type="button"
          onClick={onUseEmbed}
          className="rounded-full border border-line/70 bg-surface px-2.5 py-1 font-medium text-muted transition hover:bg-surface-2 hover:text-fg"
        >
          Use embed instead
        </button>
      </div>
    </div>
  );
};

export default HlsPlayer;
