import { useEffect, useRef, useState } from 'react';

import {
  FastForwardIcon,
  PaperAirplaneIcon,
  PauseIcon,
  PlayIcon,
  SparklesIcon,
} from '@heroicons/react/outline';

import TonePicker from '@components/watch/companion/TonePicker';
import type { CompanionSeed } from '@components/watch/CompanionChat';
import { getAiredContext } from '@utility/companionContext';
import { useCompanionPrefs } from '@utility/companionPrefs';
import { getRoomConnection } from '@utility/room';
import {
  markRoomActive,
  markRoomInactive,
  pushRoomMessage,
  roomMsgId,
  useRoomMessages,
  type RoomMsg,
} from '@utility/roomChatStore';
import {
  sendDanmaku,
  sendReaction,
  toggleDanmaku,
  useDanmakuOn,
} from '@utility/roomOverlayStore';

// The room's side chat: people talking over the same episode, plus the watch
// companion when someone calls it in. Messages ride the room's realtime channel
// and are ephemeral (a live conversation, not saved history). The list lives in
// the shared roomChatStore so the right-rail panel and the fullscreen dock show
// the same thread. The companion reuses the normal /api/companion route, with
// the asker's own tone; because the room keeps everyone's playback locked
// together, the asker's spoiler-safe window is also everyone's, so a called-in
// answer can't get ahead of the slowest seat.

// mm:ss episode position the action happened at.
const fmtPos = (s?: number): string => {
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) return '';
  const sec = Math.floor(s);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

// Wall-clock time the action happened (viewer's local time).
const fmtClock = (ms?: number): string => {
  if (!ms) return '';
  const d = new Date(ms);
  const h12 = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h12}:${m} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
};

const ACTIVITY: Record<
  'play' | 'pause' | 'seek',
  { verb: string; Icon: React.FC<React.SVGProps<SVGSVGElement>> }
> = {
  pause: { verb: 'paused at', Icon: PauseIcon },
  play: { verb: 'resumed at', Icon: PlayIcon },
  seek: { verb: 'jumped to', Icon: FastForwardIcon },
};

// Reaction emojis that float up over the video for everyone in the room.
const REACTIONS = ['🔥', '😂', '😭', '👏', '💀', '✨'];

// One feed row: a playback-activity line, a companion reply, or a chat message.
const MessageRow: React.FC<{ m: RoomMsg }> = ({ m }) => {
  if (m.kind === 'activity' && m.action) {
    const { verb, Icon } = ACTIVITY[m.action];
    return (
      <div className="flex items-center justify-center gap-1.5 py-0.5 text-[11px] text-faint">
        <Icon className="h-3 w-3 shrink-0 text-accent/70" />
        <span className="text-center">
          <span className="font-semibold text-muted">{m.name}</span> {verb}{' '}
          <span className="tabular-nums text-muted">{fmtPos(m.posSec)}</span>
          {m.at ? (
            <span className="text-faint/70"> · {fmtClock(m.at)}</span>
          ) : null}
        </span>
      </div>
    );
  }

  if (m.kind === 'companion') {
    return (
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-aurora text-accent-ink">
          <SparklesIcon className="h-3 w-3" />
        </span>
        <p className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-tl-sm border border-accent/30 bg-surface/70 px-2.5 py-1.5 text-xs leading-relaxed text-fg">
          {m.text}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${m.self ? 'items-end' : 'items-start'}`}>
      {!m.self && m.name && (
        <span className="px-1 text-[10px] font-semibold text-faint">
          {m.name}
        </span>
      )}
      <p
        className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-2.5 py-1.5 text-xs leading-relaxed ${
          m.self
            ? 'rounded-br-sm bg-aurora text-accent-ink'
            : 'rounded-bl-sm border border-line/50 bg-surface/70 text-fg'
        }`}
      >
        {m.text}
      </p>
    </div>
  );
};

const RoomChat: React.FC<{
  selfName: string;
  companion: { seed: CompanionSeed; episode: number; total: number };
  // `fill` grows the chat to its container (the fullscreen dock); otherwise it's
  // a fixed-height box in the right-rail card.
  fill?: boolean;
}> = ({ selfName, companion, fill = false }) => {
  const messages = useRoomMessages();
  const prefs = useCompanionPrefs();
  const danmakuOn = useDanmakuOn();
  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);
  // 'chat' posts to the room feed; 'danmaku' flies the text across the video.
  const [mode, setMode] = useState<'chat' | 'danmaku'>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the latest line in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // While this view is mounted the room is "open", so incoming lines count as
  // read; unmounting (switching tabs / closing the dock) lets them badge again.
  useEffect(() => {
    markRoomActive();
    return () => markRoomInactive();
  }, []);

  const sendChat = (): void => {
    const text = input.trim();
    if (!text) return;
    const conn = getRoomConnection();
    if (!conn) return;
    conn.publish('chat', { name: selfName, text });
    pushRoomMessage({
      id: roomMsgId(),
      kind: 'user',
      name: selfName,
      text,
      self: true,
    });
    setInput('');
  };

  // Dispatch the composer: a chat line, or a danmaku that flies on the video.
  const send = (): void => {
    if (mode === 'danmaku') {
      const text = input.trim();
      if (!text) return;
      sendDanmaku(text, selfName);
      setInput('');
      return;
    }
    sendChat();
  };

  // Call the companion into the room: post the question as a normal chat line so
  // everyone sees what was asked, fetch a grounded reply in the asker's tone,
  // then broadcast it.
  const askCompanion = async (): Promise<void> => {
    const text = input.trim();
    if (!text || asking) return;
    const conn = getRoomConnection();
    if (!conn) return;
    conn.publish('chat', { name: selfName, text });
    pushRoomMessage({
      id: roomMsgId(),
      kind: 'user',
      name: selfName,
      text,
      self: true,
    });
    setInput('');
    setAsking(true);
    try {
      const aired = getAiredContext();
      const res = await fetch('/api/companion?nostream=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          seed: companion.seed,
          episode: companion.episode,
          total: companion.total,
          tone: prefs.tone,
          mature: prefs.mature,
          window: aired?.lines ?? [],
          roster: companion.seed.roster ?? [],
          studios: companion.seed.studios ?? [],
          message: text,
        }),
      });
      const data = (await res.json()) as { reply?: string };
      const reply = (data.reply || '').trim();
      if (reply) {
        conn.publish('companion', { text: reply });
        pushRoomMessage({ id: roomMsgId(), kind: 'companion', text: reply });
      }
    } catch {
      /* a missed answer just doesn't show; the chat keeps going */
    } finally {
      setAsking(false);
    }
  };

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-line/50 bg-canvas ${
        fill ? 'min-h-0 flex-1' : 'h-72'
      }`}
    >
      <div
        ref={scrollRef}
        className="flex-1 space-y-2 overflow-y-auto px-3 py-2.5"
      >
        {messages.length === 0 ? (
          <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-faint">
            Say something to the room, or tap the spark to pull the companion
            in. Nobody gets ahead of the slowest seat.
          </p>
        ) : (
          messages.map((m) => <MessageRow key={m.id} m={m} />)
        )}
      </div>

      <div className="border-t border-line/50 px-2 py-2">
        {/* Left: send as chat vs danmaku. Right: the companion's tone. */}
        <div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
          <div className="inline-flex rounded-full border border-line/60 p-0.5 text-[10px] font-semibold">
            <button
              type="button"
              onClick={() => setMode('chat')}
              aria-pressed={mode === 'chat'}
              className={`min-h-[44px] rounded-full px-3 py-1 transition [touch-action:manipulation] ${
                mode === 'chat'
                  ? 'bg-aurora text-accent-ink'
                  : 'text-muted hover:text-fg'
              }`}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => setMode('danmaku')}
              aria-pressed={mode === 'danmaku'}
              className={`min-h-[44px] rounded-full px-3 py-1 transition [touch-action:manipulation] ${
                mode === 'danmaku'
                  ? 'bg-aurora text-accent-ink'
                  : 'text-muted hover:text-fg'
              }`}
            >
              🌠 Danmaku
            </button>
          </div>
          <TonePicker placement="top" />
        </div>

        {/* Reactions fly over the video; the danmaku toggle hides/shows comments.
            Both controls live here so the player itself stays uncluttered. */}
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 px-0.5">
          <div className="flex flex-wrap items-center gap-0.5">
            {REACTIONS.map((e) => (
              <button
                key={e}
                type="button"
                aria-label={`React ${e}`}
                onClick={() => sendReaction(e)}
                className="grid h-11 w-11 place-items-center rounded-md text-base transition [touch-action:manipulation] hover:bg-surface/70 active:scale-95 motion-reduce:transition-none"
              >
                {e}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleDanmaku}
            aria-pressed={danmakuOn}
            title={danmakuOn ? 'Hide danmaku' : 'Show danmaku'}
            className={`min-h-[44px] shrink-0 rounded-full border px-2 py-1 text-xs font-semibold transition [touch-action:manipulation] ${
              danmakuOn
                ? 'border-accent/40 text-accent'
                : 'border-line/60 text-faint hover:text-muted'
            }`}
          >
            🌠 {danmakuOn ? 'on' : 'off'}
          </button>
        </div>

        <div className="flex items-end gap-1.5">
          <button
            type="button"
            onClick={askCompanion}
            disabled={asking || !input.trim()}
            aria-label="Ask the companion"
            title="Ask the companion"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-line/60 bg-surface/50 text-muted transition [touch-action:manipulation] hover:border-accent/50 hover:text-accent active:scale-95 disabled:opacity-40"
          >
            <SparklesIcon
              className={`h-4 w-4 ${asking ? 'animate-pulse' : ''}`}
            />
          </button>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={
              mode === 'danmaku' ? 'Fly a danmaku…' : 'Message the room…'
            }
            className="max-h-20 min-h-[44px] min-w-0 flex-1 resize-none rounded-lg border border-line/60 bg-surface/50 px-2.5 py-1.5 text-base text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={!input.trim()}
            aria-label={mode === 'danmaku' ? 'Fly danmaku' : 'Send to the room'}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-aurora text-accent-ink shadow-glow transition [touch-action:manipulation] active:scale-95 disabled:opacity-40"
          >
            <PaperAirplaneIcon className="h-4 w-4 rotate-90" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomChat;
