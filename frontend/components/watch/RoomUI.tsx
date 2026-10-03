import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/router';

import {
  ClipboardCheckIcon,
  LinkIcon,
  LogoutIcon,
  UserGroupIcon,
} from '@heroicons/react/outline';

import type { CompanionSeed } from '@components/watch/CompanionChat';
import RoomChat from '@components/watch/RoomChat';
import { useSelector } from '@store/store';
import { getSession } from '@utility/anilistAuth';
import { subscribePlayerHandle } from '@utility/playerBus';
import {
  createRoom,
  joinRoom,
  leaveRoom,
  normalizeRoomCode,
  peekRoom,
  type RoomInfo,
  transferLeader,
  useRoom,
} from '@utility/room';

// Teleparty co-watch panel: spin up or join a room, see who's in, share the
// invite, and chat (companion included). Playback sync itself runs page-level
// (useSyncPlayer) so it survives tab switches; this is the room's face.

const NICK_KEY = 'kessoku.room.nick';

const RoomUI: React.FC<{
  initialCode?: string;
  companion: { seed: CompanionSeed; episode: number; total: number };
  // 'panel' = the windowed right-rail card. 'dock' = fills the fullscreen dock's
  // height with no card chrome (mirrors CompanionChat's variants).
  variant?: 'panel' | 'dock';
}> = ({ initialCode, companion, variant = 'panel' }) => {
  const isDock = variant === 'dock';
  const router = useRouter();
  const room = useRoom();
  // The anime this watch page is on; an identity carries it so a room knows what
  // it's watching and a joiner can be warned off a code from a different show.
  const animeId = useSelector((s) => s.anime.anime);
  const [configured, setConfigured] = useState<'unknown' | 'yes' | 'no'>(
    'unknown'
  );
  const [hasPlayer, setHasPlayer] = useState(false);
  const [nick, setNick] = useState('');
  const [avatar, setAvatar] = useState<string | undefined>(undefined);
  const [code, setCode] = useState(
    initialCode ? normalizeRoomCode(initialCode) : ''
  );
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);
  // Peeking a code before we join: a quick "finding…" beat, and a calm notice
  // when the room turns out to be watching something else.
  const [checking, setChecking] = useState(false);
  const [pendingRoom, setPendingRoom] = useState<{
    code: string;
    info: RoomInfo;
  } | null>(null);
  // Last code we auto-joined, so an invite link or a post-mismatch hop fires the
  // join exactly once per code rather than on every render.
  const autoJoinedRef = useRef<string | null>(null);

  // Are rooms even wired up (is there an Ably key)?
  useEffect(() => {
    let alive = true;
    fetch('/api/room/token?probe=1')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setConfigured(d?.configured ? 'yes' : 'no');
      })
      .catch(() => {
        if (alive) setConfigured('no');
      });
    return () => {
      alive = false;
    };
  }, []);

  // Sync needs our direct player; the embed registers no handle.
  useEffect(() => subscribePlayerHandle((h) => setHasPlayer(Boolean(h))), []);

  // Identity: an AniList handle if signed in, else a remembered nickname.
  useEffect(() => {
    const s = getSession();
    if (s?.user) {
      setNick((n) => n || s.user.name);
      setAvatar(s.user.avatar || undefined);
      return;
    }
    try {
      const saved = window.localStorage.getItem(NICK_KEY);
      if (saved) setNick((n) => n || saved);
    } catch {
      /* ignore */
    }
  }, []);

  // Build the shareable invite once we're in a room.
  useEffect(() => {
    if (room.status === 'connected' && room.roomId) {
      try {
        const u = new URL(window.location.href);
        u.searchParams.set('room', room.roomId);
        setShareUrl(u.toString());
      } catch {
        setShareUrl('');
      }
    }
  }, [room.status, room.roomId]);

  const identity = (): {
    name: string;
    avatar?: string;
    aid: string;
    episode: number;
    title: string;
  } => {
    const name = (nick.trim() || 'guest').slice(0, 24);
    try {
      window.localStorage.setItem(NICK_KEY, name);
    } catch {
      /* ignore */
    }
    return {
      name,
      avatar,
      aid: String(animeId),
      episode: companion.episode,
      title: companion.seed.title,
    };
  };

  // Manual join: peek first so a code from a different show routes the watcher
  // to that anime instead of silently joining a room that will never sync.
  const onJoin = async (): Promise<void> => {
    const c = normalizeRoomCode(code);
    if (!c) return;
    const currentAid = String(animeId);
    setChecking(true);
    let info: RoomInfo | null = null;
    try {
      info = await peekRoom(c);
    } finally {
      setChecking(false);
    }
    if (info && info.aid !== currentAid) {
      setPendingRoom({ code: c, info });
      return;
    }
    joinRoom(c, identity());
  };

  // The watcher confirmed the mismatch notice: take them to the room's anime,
  // where the page auto-joins on arrival.
  const goToPendingRoom = (): void => {
    if (!pendingRoom) return;
    const { info } = pendingRoom;
    router.push(
      `/watch/${info.aid}/?episode=${info.episode ?? 1}&room=${info.code}`
    );
    setPendingRoom(null);
  };

  const copyShare = async (): Promise<void> => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  };

  // Auto-join on arrival: an invite link (?room=…) or a post-mismatch hop drops
  // the watcher straight in, but only once we have a real name. With no name yet,
  // we leave the prefilled code + Join button so they can introduce themselves.
  const liveCode =
    typeof router.query.room === 'string'
      ? router.query.room
      : initialCode || undefined;
  useEffect(() => {
    if (!liveCode) return;
    if (configured !== 'yes') return;
    if (room.status === 'connected' || room.status === 'connecting') return;
    if (!nick.trim()) return;
    const normalized = normalizeRoomCode(liveCode);
    if (!normalized) return;
    if (autoJoinedRef.current === normalized) return;
    autoJoinedRef.current = normalized;
    joinRoom(normalized, identity());
    // identity() reads live nick/avatar/anime context at call time; re-running on
    // those primitives is enough to fire once a real name lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCode, configured, room.status, nick]);

  // --- Not configured: honest setup note. ---
  if (configured === 'no') {
    return (
      <div
        className={`flex flex-col items-center bg-canvas-2/95 px-6 py-8 text-center ${
          isDock
            ? 'h-full justify-center'
            : 'rounded-2xl border border-line/60 shadow-card'
        }`}
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-surface text-accent">
          <UserGroupIcon className="h-5 w-5" />
        </span>
        <p className="mt-3 font-display text-sm font-bold text-fg">
          Watch parties need a key
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Drop a free Ably key into{' '}
          <code className="rounded bg-surface px-1 py-0.5 text-[11px] text-fg">
            ABLY_API_KEY
          </code>{' '}
          and restart, then send a friend the link and watch in lockstep.
        </p>
        <a
          href="https://ably.com/sign-up"
          target="_blank"
          rel="noreferrer"
          className="mt-3 rounded-full bg-aurora px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-glow transition active:scale-95"
        >
          Get a free Ably key
        </a>
      </div>
    );
  }

  // --- Connected: the room. ---
  if (room.status === 'connected') {
    const iLead = room.leaderId === room.selfId;
    const others = room.members.filter((m) => m.clientId !== room.selfId);
    return (
      <div
        className={`flex flex-col gap-3 bg-canvas-2/95 p-3 ${
          isDock ? 'h-full' : 'rounded-2xl border border-line/60 shadow-card'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-aurora text-accent-ink shadow-glow">
              <UserGroupIcon className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="font-display text-sm font-bold text-fg">
                In the room
              </p>
              <p className="text-[11px] text-faint">
                {room.members.length} watching together
              </p>
            </div>
          </div>
          <span className="rounded-full border border-line/60 bg-surface px-2.5 py-1 text-xs font-semibold tracking-[0.18em] text-fg">
            {room.roomId}
          </span>
        </div>

        {!hasPlayer && (
          <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-200/90">
            Sync rides our own player. On the embed you&apos;ll still share the
            chat, just not the playback.
          </p>
        )}

        {/* Invite link */}
        <div className="flex items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line/60 bg-surface/50 px-2 py-1.5">
            <LinkIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
            <span className="truncate text-[11px] text-muted">
              {shareUrl || 'preparing invite…'}
            </span>
          </div>
          <button
            type="button"
            onClick={copyShare}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line/60 bg-surface/50 text-muted transition hover:border-accent/50 hover:text-accent active:scale-95"
            aria-label="Copy invite link"
            title="Copy invite link"
          >
            {copied ? (
              <ClipboardCheckIcon className="h-4 w-4 text-accent" />
            ) : (
              <LinkIcon className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Members */}
        <div className="flex flex-wrap gap-1.5">
          {room.members.map((m) => {
            const isSelf = m.clientId === room.selfId;
            const isLeader = m.clientId === room.leaderId;
            const name = m.data.name || 'guest';
            return (
              <span
                key={m.clientId}
                className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-[11px] font-medium ${
                  isSelf
                    ? 'border-accent/40 bg-surface text-fg'
                    : 'border-line/60 bg-surface/50 text-muted'
                }`}
              >
                {m.data.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- tiny remote avatar; next/image adds no value here
                  <img
                    src={m.data.avatar}
                    alt=""
                    className="h-5 w-5 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-aurora text-[10px] font-bold text-accent-ink">
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
                {name}
                {isLeader && (
                  <span
                    role="img"
                    aria-label="has the remote"
                    title="Holding the remote"
                    className="leading-none"
                  >
                    👑
                  </span>
                )}
                {isSelf && <span className="text-faint">you</span>}
              </span>
            );
          })}
        </div>

        {/* Handing the remote: the driver taps a watcher to make them leader.
            Only the driver sees this, and only when someone else is here. */}
        {iLead && others.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-faint">Hand the remote to</span>
            {others.map((m) => (
              <button
                key={m.clientId}
                type="button"
                onClick={() => transferLeader(m.clientId)}
                aria-label={`Hand the remote to ${m.data.name || 'guest'}`}
                title={`Make ${m.data.name || 'guest'} the leader`}
                className="inline-flex items-center gap-1 rounded-full border border-line/60 bg-surface/50 px-2.5 py-1 text-[11px] font-semibold text-muted transition hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95"
              >
                {m.data.name || 'guest'}
                <span role="img" aria-hidden className="leading-none">
                  👑
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Leadership status line (the two conditions are mutually exclusive). */}
        {room.leaderId && room.leaderId === room.selfId && (
          <p className="text-[11px] text-faint">You&apos;ve got the remote.</p>
        )}
        {room.leaderId && room.leaderId !== room.selfId && (
          <p className="text-[11px] text-faint">
            {room.members.find((m) => m.clientId === room.leaderId)?.data
              .name || 'someone'}{' '}
            has the remote. Sit back and watch.
          </p>
        )}

        <RoomChat
          selfName={nick.trim() || 'guest'}
          companion={companion}
          fill={isDock}
        />

        <button
          type="button"
          onClick={() => leaveRoom()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line/60 px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent/50 hover:text-fg active:scale-95"
        >
          <LogoutIcon className="h-3.5 w-3.5" />
          Leave the room
        </button>
      </div>
    );
  }

  // --- Lobby: create or join. ---
  const connecting = room.status === 'connecting' || configured === 'unknown';
  return (
    <div
      className={`flex flex-col gap-3 bg-canvas-2/95 p-4 ${
        isDock
          ? 'h-full justify-center'
          : 'rounded-2xl border border-line/60 shadow-card'
      }`}
    >
      <div>
        <p className="font-display text-sm font-bold text-fg">Watch together</p>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Spin up a room, send the link, watch in lockstep. Whoever starts it
          holds the remote, and can pass it on.
        </p>
      </div>

      {!hasPlayer && (
        <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-200/90">
          Heads up: lockstep playback rides our own player. On the embed you can
          still chat, just not sync.
        </p>
      )}

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-faint">
          Your name
        </span>
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          maxLength={24}
          placeholder="what should the room call you?"
          className="min-h-[44px] w-full rounded-lg border border-line/60 bg-surface/50 px-3 py-2 text-base text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
        />
      </label>

      <button
        type="button"
        onClick={() => createRoom(identity())}
        disabled={connecting}
        className="rounded-lg bg-aurora px-3 py-2 text-sm font-semibold text-accent-ink shadow-glow transition active:scale-95 disabled:opacity-50"
      >
        {room.status === 'connecting' ? 'Opening the room…' : 'Start a room'}
      </button>

      <div className="flex items-center gap-2 text-[11px] text-faint">
        <span className="h-px flex-1 bg-line/60" />
        or join one
        <span className="h-px flex-1 bg-line/60" />
      </div>

      {pendingRoom ? (
        // Mismatch: the typed code belongs to another show. Offer the hop over
        // instead of joining a room that would never sync to this player.
        <div className="rounded-2xl border border-line/60 bg-surface px-3.5 py-3 shadow-glow">
          <p className="text-sm font-semibold text-fg">
            This room is watching {pendingRoom.info.title || 'another anime'}.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Hop over and watch it together?
          </p>
          <div className="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={goToPendingRoom}
              aria-label="Go to the room's anime and watch together"
              className="rounded-lg bg-aurora px-3 py-2 text-sm font-semibold text-accent-ink shadow-glow transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95"
            >
              Take me there
            </button>
            <button
              type="button"
              onClick={() => setPendingRoom(null)}
              aria-label="Dismiss and stay on this anime"
              className="rounded-lg border border-line/60 px-3 py-2 text-sm font-semibold text-muted transition hover:border-accent/50 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-95"
            >
              Stay here
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <input
            value={code}
            onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onJoin();
            }}
            placeholder="Room code"
            className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-line/60 bg-surface/50 px-3 py-2 text-base font-semibold tracking-[0.18em] text-fg placeholder:font-normal placeholder:tracking-normal placeholder:text-faint focus:border-accent/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              onJoin();
            }}
            disabled={connecting || checking || !code.trim()}
            className="rounded-lg border border-line/60 px-4 py-2 text-sm font-semibold text-fg transition hover:border-accent/50 active:scale-95 disabled:opacity-50"
          >
            {checking ? 'Finding the room…' : 'Join'}
          </button>
        </div>
      )}

      {room.status === 'error' && room.error && (
        <p className="text-center text-[11px] text-accent">{room.error}</p>
      )}
    </div>
  );
};

export default RoomUI;
