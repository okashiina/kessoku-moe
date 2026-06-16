import { useCallback, useEffect, useRef, useState } from 'react';

import {
  EyeIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  XIcon,
} from '@heroicons/react/outline';

import CompanionCards from '@components/watch/companion/CompanionCards';
import TonePicker from '@components/watch/companion/TonePicker';
import type { CompanionCard, SseEvent } from '@utility/companion/types';
import { getAiredContext } from '@utility/companionContext';
import { useCompanionPrefs } from '@utility/companionPrefs';
import {
  appendMessage,
  getThread,
  setThread,
  useCompanionThread,
} from '@utility/companionThread';
import { getPlayerHandle, subscribePlayerHandle } from '@utility/playerBus';

// In-player AI watch companion. Grounds each reply on the title + a spoiler-safe
// window of subtitle lines the player has actually shown (via getAiredContext),
// streams the answer over SSE so it types out live, and can surface entity
// cards (voice actor / studio / character) fetched from real AniList data — so
// it never has to guess who someone is. Anonymous and best-effort: when no API
// key is configured it shows a friendly setup note instead of failing loudly.

export interface CompanionSeed {
  title: string;
  synopsis: string;
  genres: string[];
  format: string;
  // Release year — disambiguates same-titled seasons when resolving the Kitsu
  // entry for episode recaps.
  year?: number;
  // Low-spoiler cast roster: names + role + JP voice actor, plus AniList ids +
  // images so the lookup tools resolve "who voices X" by id and cards have faces.
  roster?: {
    name: string;
    role?: string;
    va?: string;
    characterId?: number;
    vaId?: number;
    characterImage?: string;
    vaImage?: string;
  }[];
  // Studios (id + name) so a "who made this?" lookup resolves without a search.
  studios?: { id: number; name: string; isMain?: boolean }[];
  // Earlier parts (prequel / parent) the viewer watched to reach this one, so a
  // sequel's prior seasons count as already-watched, not spoilers.
  prequels?: string[];
}

// The in-progress assistant turn, rendered as the last bubble while streaming.
interface Draft {
  shown: string;
  cards: CompanionCard[];
  thinking: string | null;
}

// mm:ss for the per-message episode timestamp ("you asked at 12:34").
const fmtTime = (s: number): string => {
  if (!Number.isFinite(s) || s < 0) return '';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const CompanionChat: React.FC<{
  seed: CompanionSeed;
  animeId: number;
  episode: number;
  total: number;
  // 'dock' = the fullscreen right-side panel: fills its container's full height
  // (no card chrome). 'panel' = the windowed right-rail card.
  variant?: 'panel' | 'dock';
}> = ({ seed, animeId, episode, total, variant = 'panel' }) => {
  const prefs = useCompanionPrefs();

  // The conversation lives in the shared per-episode thread store, so it
  // persists across reloads AND renders identically in the right-rail panel and
  // the fullscreen dock (both mount this component with the same animeId+episode).
  const messages = useCompanionThread(animeId, episode);

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<'unknown' | 'yes' | 'no'>(
    'unknown'
  );
  // Vision (👁): the provider can see (Gemini) AND a direct player is mounted to
  // grab a frame from. `frame` is the staged still attached to the next turn.
  const [visionReady, setVisionReady] = useState(false);
  const [hasPlayer, setHasPlayer] = useState(false);
  const [frame, setFrame] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Streaming state lives in refs so the typewriter timer and the SSE read loop
  // share it without re-render churn; `draft` is only what we paint.
  const fullRef = useRef('');
  const shownRef = useRef(0);
  const cardsRef = useRef<CompanionCard[]>([]);
  const atRef = useRef<number | undefined>(undefined);
  const doneRef = useRef(false);
  const errorCodeRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // RULE: every hyperlink the companion surfaces opens in a NEW TAB, in both the
  // rail and the fullscreen dock, so tapping a card never navigates the viewer
  // out of the episode they're streaming.
  const cardTarget = '_blank';

  const clearTimer = (): void => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Commit the finished turn to the shared thread, then drop the local draft.
  const finalize = useCallback((): void => {
    clearTimer();
    const full = fullRef.current.trim();
    const cards = cardsRef.current;
    if (full || cards.length) {
      appendMessage(animeId, episode, {
        role: 'assistant',
        content: full,
        t: atRef.current,
        ...(cards.length ? { cards } : {}),
      });
    } else if (errorCodeRef.current === 'rate_limited') {
      setError(
        "That's the free companion quota spent for today. Try again later."
      );
    } else {
      setError('I blanked on that one. Try asking again?');
    }
    setDraft(null);
    setBusy(false);
  }, [animeId, episode]);

  // Abort the turn with no committed message (e.g. unconfigured / hard error).
  const abort = useCallback((message?: string): void => {
    clearTimer();
    setDraft(null);
    setBusy(false);
    if (message) setError(message);
  }, []);

  // A 429 from the companion endpoint: out of quota. The server tells us which
  // tier tripped via `reason` ('daily' vs per-minute 'ip'/'global'); show that in
  // the companion's own voice instead of guessing from the retry window.
  const abort429 = useCallback(
    async (res: Response): Promise<void> => {
      let reason = '';
      try {
        const j = (await res.json()) as { reason?: string };
        reason = String(j?.reason || '');
      } catch {
        /* ignore */
      }
      abort(
        reason === 'daily'
          ? "That's the free companion quota for today. Catch you tomorrow."
          : 'Easy, one at a time. Give me a few seconds and ask again.'
      );
    },
    [abort]
  );

  // Typewriter: reveal fullRef toward the viewer a few chars per tick so both a
  // real token stream and an instant replay look like live typing. Finalizes
  // once the text is fully shown AND the stream is done.
  const startTypewriter = useCallback((): void => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      const full = fullRef.current;
      if (shownRef.current < full.length) {
        const remaining = full.length - shownRef.current;
        shownRef.current = Math.min(
          full.length,
          shownRef.current + Math.max(2, Math.ceil(remaining / 6))
        );
        const shown = full.slice(0, shownRef.current);
        setDraft((d) => (d ? { ...d, shown, cards: cardsRef.current } : d));
      } else if (doneRef.current) {
        finalize();
      }
    }, 24);
  }, [finalize]);

  // Apply one decoded SSE event to the streaming refs/draft.
  const handleEvent = useCallback((evt: SseEvent): void => {
    switch (evt.type) {
      case 'thinking':
        setDraft((d) => (d ? { ...d, thinking: evt.label } : d));
        break;
      case 'card':
        cardsRef.current = [...cardsRef.current, evt.card];
        setDraft((d) => (d ? { ...d, cards: cardsRef.current } : d));
        break;
      case 'text_delta':
        fullRef.current += evt.text;
        setDraft((d) => (d && d.thinking ? { ...d, thinking: null } : d));
        break;
      case 'done':
        doneRef.current = true;
        break;
      case 'error':
        // Remember why so finalize can show the right message (rate limit vs a
        // generic blank). Partial text, if any, is still committed.
        errorCodeRef.current = evt.code;
        break;
      default:
        break;
    }
  }, []);

  // One-shot status probe so we can show chat vs. the setup note up front, and
  // whether the provider can see (drives the 👁 button).
  useEffect(() => {
    let alive = true;
    fetch('/api/companion')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setConfigured(d?.configured ? 'yes' : 'no');
        setVisionReady(Boolean(d?.vision));
      })
      .catch(() => {
        if (alive) setConfigured('no');
      });
    return () => {
      alive = false;
    };
  }, []);

  // Track whether a direct player is mounted (embed registers no handle). The 👁
  // button only makes sense when there's a real frame to capture.
  useEffect(() => subscribePlayerHandle((h) => setHasPlayer(Boolean(h))), []);

  // A frame staged for a turn is stale once the viewer has scrubbed on; drop it
  // if they keep watching without sending, so 👁 never sends an old moment.
  useEffect(() => {
    if (!frame) return undefined;
    const h = getPlayerHandle();
    if (!h) return undefined;
    const off = h.on('seek', () => setFrame(null));
    return off;
  }, [frame]);

  // Stop the typewriter if we unmount mid-stream (tab/episode switch).
  useEffect(() => () => clearTimer(), []);

  // Keep the latest message in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, draft]);

  // Buffered fallback when SSE can't establish (flaky proxy): one JSON round-trip.
  const fallbackNostream = useCallback(
    async (payload: unknown): Promise<void> => {
      try {
        const res = await fetch('/api/companion?nostream=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.status === 503) {
          setConfigured('no');
          abort();
          return;
        }
        if (res.status === 429) {
          await abort429(res);
          return;
        }
        if (!res.ok) {
          abort('I lost the signal there. Give it another shot in a sec.');
          return;
        }
        const data = (await res.json()) as {
          reply?: string;
          cards?: CompanionCard[];
        };
        if (data.reply || (data.cards && data.cards.length)) {
          fullRef.current = data.reply || '';
          cardsRef.current = data.cards || [];
          doneRef.current = true; // the typewriter plays it out, then finalizes
        } else {
          abort('I blanked on that one. Try asking again?');
        }
      } catch {
        abort('I lost the signal there. Give it another shot in a sec.');
      }
    },
    [abort, abort429]
  );

  // Grab the current frame off the player and stage it for the next turn. Null
  // (a tainted canvas, or paused before any frame) just nudges the viewer.
  const lookAtFrame = useCallback((): void => {
    const data = getPlayerHandle()?.captureFrame() ?? null;
    if (data) {
      setFrame(data);
      setError(null);
    } else {
      setError("Couldn't catch that frame. Try again once it's playing.");
    }
  }, []);

  const send = async (): Promise<void> => {
    const text = input.trim();
    if (!text || busy) return;
    // Snapshot the staged frame for this turn, then clear it so it rides along
    // exactly once.
    const turnFrame = frame;
    setFrame(null);

    // Grab the live playback position first so the turn is stamped with the
    // episode minute it happened at, then write the user turn through the shared
    // store (the other panel may have appended since this render).
    const aired = getAiredContext();
    const at = aired?.current;
    const history = getThread(animeId, episode);
    setThread(
      animeId,
      episode,
      history.concat({ role: 'user', content: text, t: at })
    );
    setInput('');
    setError(null);
    setBusy(true);

    // Reset streaming state for this turn.
    fullRef.current = '';
    shownRef.current = 0;
    cardsRef.current = [];
    atRef.current = at;
    doneRef.current = false;
    errorCodeRef.current = null;
    setDraft({ shown: '', cards: [], thinking: null });
    startTypewriter();

    const payload = {
      seed,
      episode,
      total,
      tone: prefs.tone,
      mature: prefs.mature,
      window: aired?.lines ?? [],
      roster: seed.roster ?? [],
      studios: seed.studios ?? [],
      messages: history
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content })),
      message: text,
      ...(turnFrame ? { frameData: turnFrame } : {}),
    };

    try {
      const res = await fetch('/api/companion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 503) {
        setConfigured('no');
        abort();
        return;
      }
      if (res.status === 429) {
        await abort429(res);
        return;
      }
      if (!res.ok || !res.body) {
        await fallbackNostream(payload);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl = buf.indexOf('\n');
        while (nl >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          nl = buf.indexOf('\n');
          if (line.startsWith('data:')) {
            try {
              handleEvent(JSON.parse(line.slice(5).trim()) as SseEvent);
            } catch {
              // keepalive / partial frame — ignore
            }
          }
        }
      }
      doneRef.current = true;
    } catch {
      // Nothing streamed yet → try the buffered path; otherwise keep the partial.
      if (!fullRef.current && cardsRef.current.length === 0) {
        await fallbackNostream(payload);
      } else {
        doneRef.current = true;
      }
    }
  };

  // The streaming bubble: a "looking it up" pill before any text, the typed
  // text with a cursor once it starts, or the initial three-dot wait.
  const renderDraft = (d: Draft): JSX.Element => {
    if (d.thinking && !d.shown) {
      return (
        <span className="inline-flex items-center gap-2 rounded-2xl rounded-bl-sm border border-line/50 bg-surface/70 px-3 py-2 text-xs text-muted">
          <SparklesIcon className="h-3.5 w-3.5 animate-pulse text-accent" />
          {d.thinking}
        </span>
      );
    }
    if (d.shown) {
      return (
        <p className="max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-line/50 bg-surface/70 px-3 py-2 text-sm leading-relaxed text-fg">
          {d.shown}
          <span className="ml-px inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-accent align-baseline" />
        </p>
      );
    }
    return (
      <span className="flex gap-1 rounded-2xl rounded-bl-sm border border-line/50 bg-surface/70 px-3 py-3">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint"
            style={{ animationDelay: `${dot * 150}ms` }}
          />
        ))}
      </span>
    );
  };

  return (
    <div
      className={`flex flex-col overflow-hidden bg-canvas-2/95 ${
        variant === 'dock'
          ? 'h-full'
          : 'h-[30rem] max-h-[72vh] rounded-2xl border border-line/60 shadow-card lg:h-[34rem]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-line/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-aurora text-accent-ink shadow-glow">
            <SparklesIcon className="h-4 w-4" />
          </span>
          <div className="leading-tight">
            <p className="font-display text-sm font-bold text-fg">
              Watch companion
            </p>
            <p className="text-[11px] text-faint">in the next seat</p>
          </div>
        </div>

        {/* Tone picker (shared with the co-watch room composer) */}
        <TonePicker />
      </div>

      {/* Body */}
      {configured === 'no' ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-surface text-accent">
            <SparklesIcon className="h-5 w-5" />
          </span>
          <p className="mt-3 font-display text-sm font-bold text-fg">
            Almost showtime
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            The companion is wired in, it just needs a key. Drop a free Google
            AI Studio key into{' '}
            <code className="rounded bg-surface px-1 py-0.5 text-[11px] text-fg">
              COMPANION_API_KEY
            </code>{' '}
            and restart, then I will be right here in the next seat.
          </p>
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="mt-3 rounded-full bg-aurora px-3 py-1.5 text-xs font-semibold text-accent-ink shadow-glow transition active:scale-95"
          >
            Get a free key
          </a>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
        >
          {messages.length === 0 && !draft && (
            <div className="flex h-full flex-col items-center justify-center px-2 text-center">
              <p className="font-display text-sm font-bold text-fg">
                Pull up a seat
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                I only know what has played so far, so say what you are thinking
                and I will keep up. Ask me who voices someone, too. No spoilers
                from me.
              </p>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={i}
              className={`flex flex-col gap-2 ${
                m.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              {m.role === 'assistant' && m.cards && (
                <CompanionCards cards={m.cards} target={cardTarget} />
              )}
              {m.content && (
                <p
                  className={`whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'max-w-[85%] rounded-br-sm bg-aurora text-accent-ink'
                      : 'max-w-[92%] rounded-bl-sm border border-line/50 bg-surface/70 text-fg'
                  }`}
                >
                  {m.content}
                </p>
              )}
              {m.role === 'user' && typeof m.t === 'number' && (
                <span className="px-1 text-[10px] text-faint">
                  at {fmtTime(m.t)}
                </span>
              )}
            </div>
          ))}

          {/* Live, in-progress turn */}
          {draft && (
            <div className="flex flex-col items-start gap-2">
              {draft.cards.length > 0 && (
                <CompanionCards cards={draft.cards} target={cardTarget} />
              )}
              {renderDraft(draft)}
            </div>
          )}

          {error && (
            <p className="text-center text-[11px] text-accent">{error}</p>
          )}
        </div>
      )}

      {/* Composer */}
      {configured !== 'no' && (
        <div className="border-t border-line/50 px-3 py-2.5">
          {/* Staged frame: the still the companion will look at on the next turn. */}
          {frame && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-accent/40 bg-surface/60 p-1.5 pr-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- transient in-memory capture; next/image can't optimise a data URL */}
              <img
                src={frame}
                alt="The frame you're asking about"
                className="h-9 w-16 rounded-md object-cover ring-1 ring-line/50"
              />
              <span className="flex-1 text-[11px] font-medium text-muted">
                Looking at this frame
              </span>
              <button
                type="button"
                onClick={() => setFrame(null)}
                aria-label="Drop the frame"
                className="grid h-6 w-6 place-items-center rounded-full text-faint transition hover:bg-surface hover:text-fg"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            {visionReady && hasPlayer && (
              <button
                type="button"
                onClick={lookAtFrame}
                aria-label="Look at the current frame"
                title="Look at the current frame"
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition active:scale-95 ${
                  frame
                    ? 'border-accent/60 bg-surface text-accent'
                    : 'border-line/60 bg-surface/50 text-muted hover:border-accent/50 hover:text-fg'
                }`}
              >
                <EyeIcon className="h-5 w-5" />
              </button>
            )}
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
              placeholder="Talk about this episode…"
              className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-line/60 bg-surface/50 px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={send}
              disabled={busy || !input.trim()}
              aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-aurora text-accent-ink shadow-glow transition active:scale-95 disabled:opacity-40"
            >
              <PaperAirplaneIcon className="h-5 w-5 rotate-90" />
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-faint">
            Spoiler-safe: I only know up to where you have watched.
          </p>
        </div>
      )}
    </div>
  );
};

export default CompanionChat;
