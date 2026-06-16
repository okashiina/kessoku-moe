import React, { useEffect, useRef, useState } from 'react';

import type { FillerKind } from '@animeflix/api';
import { CheckCircleIcon, RewindIcon } from '@heroicons/react/solid';

import useWatchedEpisodes from '@hooks/useWatchedEpisodes';
import { setEpisode } from '@slices/episode';
import { useDispatch, useSelector } from '@store/store';
import { noteProgressRewind } from '@utility/anilistSync';
import {
  getEntry,
  markWatched,
  unmarkWatched,
  unwatchFrom,
} from '@utility/progress';

// Only the "notable" kinds get a marker bar; the canon majority stays unmarked
// so filler/mixed actually stand out at a glance.
const BAR_COLOR: Record<FillerKind, string> = {
  canon: '',
  filler: 'bg-amber-400',
  mixed: 'bg-violet-400',
  'anime-canon': 'bg-sky-400',
};

const KIND_LABEL: Record<FillerKind, string> = {
  canon: 'Manga canon',
  filler: 'Filler',
  mixed: 'Mixed canon/filler',
  'anime-canon': 'Anime canon',
};

const LEGEND: FillerKind[] = ['filler', 'mixed', 'anime-canon'];

export interface PageButtonProps {
  start: number;
  end: number;
  active: boolean;
  onClick: () => void;
}

const PageButton: React.FC<PageButtonProps> = ({
  start,
  end,
  active,
  onClick,
}) => (
  <button
    onClick={onClick}
    className={`rounded-lg border px-3 py-1 text-sm tabular-nums transition duration-150 active:scale-95 ${
      active
        ? 'border-transparent bg-aurora font-semibold text-accent-ink'
        : 'border-line/70 bg-surface text-muted hover:bg-surface-2 hover:text-fg'
    }`}
  >
    {start}-{end}
  </button>
);

const GoToEpisode: React.FC = () => {
  const dispatch = useDispatch();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">Go to</span>
      <input
        ref={inputRef}
        inputMode="numeric"
        className="w-24 rounded-lg border border-line/70 bg-surface px-3 py-1.5 text-sm text-fg placeholder-faint outline-none transition focus:border-accent/70"
        placeholder="Ep no."
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          const value = parseInt(inputRef.current.value, 10);
          if (!Number.isNaN(value)) dispatch(setEpisode(value));
          inputRef.current.value = '';
        }}
      />
    </div>
  );
};

export interface EpisodeProps {
  /** Primary lookup title for filler data (AniList romaji works best). */
  title?: string;
  /** Secondary title tried if the primary finds nothing (English). */
  altTitle?: string;
}

const Episode: React.FC<EpisodeProps> = ({ title, altTitle }) => {
  const episodes = useSelector((store) => store.gogoApi.totalEpisodes);
  const current = useSelector((store) => store.episode.episode);
  const animeId = useSelector((store) => store.anime.anime);
  const dispatch = useDispatch();

  // Live set of episodes the viewer has finished (or hand-marked).
  const watched = new Set(useWatchedEpisodes(animeId));

  // Context menu (right-click / long-press an episode tile): single-episode
  // mark toggle + "unwatch from here" rewind. Fixed-positioned at the press
  // point, clamped to the viewport, dismissed by outside press or Escape.
  const [menu, setMenu] = useState<{ ep: number; x: number; y: number } | null>(
    null
  );
  const closeMenu = () => setMenu(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu) return undefined;
    firstItemRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  // Toggle a single episode's watched state. Auto-set when the player nears the
  // end of an episode; this is the manual override (via the context menu).
  const toggle = (v: number) => {
    if (watched.has(v)) unmarkWatched(animeId, v);
    else markWatched(animeId, v, { total: episodes });
  };

  // Explicit rewind: clear marks from `v` onward, pull the resume pointer back
  // to `v`, and let the sync push the LOWER progress to AniList once.
  const rewindFrom = (v: number) => {
    unwatchFrom(animeId, v);
    noteProgressRewind(animeId);
  };

  const openMenu = (v: number, x: number, y: number) => {
    // Clamp so the panel never renders off-screen (est. 232x132 panel).
    const cx = Math.min(Math.max(8, x), window.innerWidth - 240);
    const cy = Math.min(Math.max(8, y), window.innerHeight - 140);
    setMenu({ ep: v, x: cx, y: cy });
  };

  // ~500ms press-and-hold to open the menu, the touch-friendly twin of the
  // right-click. Cancelled if the finger lifts, leaves, or drifts.
  const pressTimer = useRef<ReturnType<typeof setTimeout>>();
  const pressPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // Eat the click that follows a long-press, so opening the menu by holding a
  // tile doesn't also navigate to that episode underneath it.
  const suppressClick = useRef(false);
  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = undefined;
    }
  };
  useEffect(() => clearPress, []);

  const [currentPage, setPage] = useState(1);
  const [filler, setFiller] = useState<Record<number, FillerKind>>({});

  // Keep the pager on the batch holding the episode in play, so a deep-progress
  // viewer (e.g. One Piece ep 1115) lands on their page, not 1-100. The watch
  // page seeds the episode from the resume point AFTER mount, so we must NOT latch
  // on the first value (it would stick on 1-100 before the resume lands); instead
  // follow `current` whenever it changes. A manual page click doesn't change
  // `current`, so browsing other batches is left alone until the episode changes.
  useEffect(() => {
    if (!episodes || !current) return;
    const totalPages = Math.ceil(episodes / 100);
    setPage(Math.min(totalPages, Math.max(1, Math.ceil(current / 100))));
  }, [current, episodes]);

  // Pull filler/canon classification client-side so the watch page's SSR is
  // never blocked on the third-party scrape. Purely decorative — failures are
  // swallowed and the grid simply renders unmarked.
  useEffect(() => {
    if (!title) return undefined;
    let active = true;

    const params = new URLSearchParams({ title });
    if (altTitle && altTitle !== title) params.set('alt', altTitle);

    fetch(`/api/filler?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data) => {
        if (active) setFiller(data ?? {});
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [title, altTitle]);

  const hasMarks = Object.values(filler).some((k) => k !== 'canon');

  // 100 episodes per page.
  const pages = Math.ceil(episodes / 100);
  const episodeArray = Array.from({ length: episodes }, (_, i) => i + 1);

  // "Unwatch from here" only shows when it would do something: a mark at or
  // past this episode, or the resume pointer standing at/after it.
  const menuEntry = menu ? getEntry(animeId) : undefined;
  const canRewind =
    menu !== null &&
    (Array.from(watched).some((e) => e >= menu.ep) ||
      (menuEntry?.ep ?? 0) > menu.ep ||
      ((menuEntry?.ep ?? 0) === menu.ep && (menuEntry?.sec ?? 0) > 0));

  if (!episodes) {
    return (
      <div className="mt-6">
        <GoToEpisode />
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-display text-lg font-bold text-fg">Episodes</h2>
        <span className="text-sm text-faint">{episodes} total</span>
        <div className="ml-auto">
          <GoToEpisode />
        </div>
      </div>

      {hasMarks && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          {LEGEND.map((kind) => (
            <span key={kind} className="flex items-center gap-1.5">
              <span
                className={`h-[3px] w-3 rounded-full ${BAR_COLOR[kind]}`}
                aria-hidden
              />
              {KIND_LABEL[kind]}
            </span>
          ))}
          <span className="text-faint">Unmarked = canon</span>
        </div>
      )}

      <p className="mb-3 text-xs text-faint">
        Long-press or right-click an episode to mark watched or rewind.
      </p>

      {pages > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {new Array(pages).fill(1).map((_v, i) => (
            <PageButton
              key={i + 1}
              start={i * 100 + 1}
              end={i * 100 + 100 > episodes ? episodes : i * 100 + 100}
              active={currentPage === i + 1}
              onClick={() => setPage(i + 1)}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1.5">
        {episodeArray
          .slice((currentPage - 1) * 100, currentPage * 100)
          .map((v) => {
            const kind = filler[v];
            const bar = kind ? BAR_COLOR[kind] : '';
            const isCurrent = v === current;
            const isWatchedEp = watched.has(v);
            let epTitle: string | undefined;
            if (kind) {
              epTitle = `${KIND_LABEL[kind]}${isWatchedEp ? ' · watched' : ''}`;
            } else if (isWatchedEp) {
              epTitle = 'Watched';
            }
            const startPress = (e: React.PointerEvent) => {
              clearPress();
              // A new gesture: any click belonging to the previous one has
              // already fired, so a stale suppress flag must not eat this tap.
              suppressClick.current = false;
              pressPoint.current = { x: e.clientX, y: e.clientY };
              pressTimer.current = setTimeout(() => {
                clearPress();
                suppressClick.current = true;
                openMenu(v, pressPoint.current.x, pressPoint.current.y);
              }, 500);
            };
            return (
              <button
                key={v}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  dispatch(setEpisode(v));
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openMenu(v, e.clientX, e.clientY);
                }}
                onPointerDown={startPress}
                onPointerUp={clearPress}
                onPointerLeave={clearPress}
                // A held finger always jitters a little; only treat real drift
                // (past ~10px) as "moved away" so the hold isn't cancelled the
                // instant a thumb shifts on a touchscreen.
                onPointerMove={(e) => {
                  if (!pressTimer.current) return;
                  const dx = e.clientX - pressPoint.current.x;
                  const dy = e.clientY - pressPoint.current.y;
                  if (dx * dx + dy * dy > 100) clearPress();
                }}
                aria-current={isCurrent}
                title={epTitle}
                // iOS Safari fires its own text-selection + magnifier on a
                // long-press, fighting our mark-watched menu. Kill the native
                // callout/selection so the hold opens only our panel.
                style={{
                  WebkitTouchCallout: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'manipulation',
                }}
                className={`relative flex h-10 select-none items-center justify-center rounded-md text-sm tabular-nums transition duration-150 active:scale-95 ${
                  isCurrent
                    ? 'bg-aurora font-semibold text-accent-ink shadow-glow'
                    : `bg-surface text-muted hover:bg-surface-2 hover:text-fg ${
                        isWatchedEp ? 'opacity-60 ring-1 ring-accent/40' : ''
                      }`
                }`}
              >
                {v}
                {isWatchedEp && (
                  <CheckCircleIcon
                    className={`absolute right-0.5 top-0.5 h-3.5 w-3.5 ${
                      isCurrent ? 'text-accent-ink/90' : 'text-accent'
                    }`}
                    aria-hidden
                  />
                )}
                {bar && (
                  <span
                    className={`absolute inset-x-1.5 bottom-1 h-[3px] rounded-full ${bar}`}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
      </div>

      {menu && (
        <>
          {/* Invisible scrim: catches the outside press / stray right-click /
              scroll and closes the menu, standard context-menu behavior. */}
          <div
            className="fixed inset-0 z-40"
            aria-hidden
            onPointerDown={closeMenu}
            onWheel={closeMenu}
            onContextMenu={(e) => {
              e.preventDefault();
              closeMenu();
            }}
          />
          <div
            role="menu"
            aria-label={`Episode ${menu.ep} watched controls`}
            className="fixed z-50 w-56 rounded-xl border border-line/70 bg-canvas-2 p-1.5 shadow-card"
            style={{ left: menu.x, top: menu.y }}
          >
            <p className="px-2.5 pb-1 pt-1 text-xs font-semibold text-faint">
              Episode {menu.ep}
            </p>
            <button
              ref={firstItemRef}
              type="button"
              role="menuitem"
              onClick={() => {
                toggle(menu.ep);
                closeMenu();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-fg/5 hover:text-fg"
            >
              <CheckCircleIcon
                className={`h-4 w-4 shrink-0 ${
                  watched.has(menu.ep) ? 'text-accent' : 'text-faint'
                }`}
                aria-hidden
              />
              {watched.has(menu.ep) ? 'Unmark watched' : 'Mark watched'}
            </button>
            {canRewind && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  rewindFrom(menu.ep);
                  closeMenu();
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted transition hover:bg-fg/5 hover:text-fg"
              >
                <RewindIcon
                  className="h-4 w-4 shrink-0 text-faint"
                  aria-hidden
                />
                <span className="flex flex-col">
                  <span>Unwatch from here</span>
                  <span className="text-xs text-faint">
                    Clears ep {menu.ep} to {episodes} and rewinds
                  </span>
                </span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Episode;
