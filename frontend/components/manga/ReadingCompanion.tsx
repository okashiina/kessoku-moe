import { useCallback, useEffect, useRef, useState } from 'react';

import {
  PaperAirplaneIcon,
  SparklesIcon,
  XIcon,
} from '@heroicons/react/outline';

import CompanionCards from '@components/watch/companion/CompanionCards';
import TonePicker from '@components/watch/companion/TonePicker';
import type {
  CompanionCard,
  CompanionRosterEntry,
  SseEvent,
} from '@utility/companion/types';
import { useCompanionPrefs } from '@utility/companionPrefs';
import {
  appendMangaMessage,
  mangaThreadKey,
  useMangaThread,
} from '@utility/manga/companionThread';

interface Draft {
  text: string;
  cards: CompanionCard[];
  thinking: string | null;
}

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.8;

const loadViaImage = (objectUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('image load failed'));
    };
    image.src = objectUrl;
  });

// Reader pages are same-origin proxy URLs, so canvas export stays untainted.
const capturePage = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('page fetch failed');
  const blob = await response.blob();
  const bitmap =
    typeof createImageBitmap === 'function'
      ? await createImageBitmap(blob)
      : await loadViaImage(URL.createObjectURL(blob));
  const { width, height } = bitmap;
  if (!width || !height) throw new Error('empty page');

  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  context.fillStyle = '#f8f7fa';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    bitmap as CanvasImageSource,
    0,
    0,
    canvas.width,
    canvas.height
  );
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close();
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
};

const ReadingCompanion: React.FC<{
  anilistId: number | null;
  title: string;
  chapterNum: number;
  totalChapters?: number;
  pageIndex: number;
  pageUrl: string | null;
  roster: CompanionRosterEntry[];
}> = ({
  anilistId,
  title,
  chapterNum,
  totalChapters,
  pageIndex,
  pageUrl,
  roster,
}) => {
  const prefs = useCompanionPrefs();
  const threadKey = mangaThreadKey(anilistId, title, chapterNum);
  const messages = useMangaThread(threadKey);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<'unknown' | 'yes' | 'no'>(
    'unknown'
  );
  const [visionReady, setVisionReady] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef('');
  const cardsRef = useRef<CompanionCard[]>([]);
  const errorCodeRef = useRef<string | null>(null);
  const historyEntryRef = useRef(false);

  const close = useCallback((): void => {
    if (historyEntryRef.current) {
      window.history.back();
    } else {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    setDraft(null);
    setError(null);
  }, [chapterNum]);

  useEffect(() => {
    let alive = true;
    fetch('/api/manga/companion')
      .then((response) => response.json())
      .then((data) => {
        if (!alive) return;
        setConfigured(data?.configured ? 'yes' : 'no');
        setVisionReady(Boolean(data?.vision));
      })
      .catch(() => {
        if (alive) setConfigured('no');
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.history.pushState(
      { ...(window.history.state || {}), kessokuReadingCompanion: true },
      ''
    );
    historyEntryRef.current = true;
    const onPopState = (): void => {
      historyEntryRef.current = false;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, draft, open]);

  const abort = useCallback((message?: string): void => {
    setDraft(null);
    setBusy(false);
    if (message) setError(message);
  }, []);

  const abort429 = useCallback(
    async (response: Response): Promise<void> => {
      let reason = '';
      try {
        const data = (await response.json()) as { reason?: string };
        reason = String(data?.reason || '');
      } catch {
        /* ignore */
      }
      abort(
        reason === 'daily'
          ? "That's the free companion quota for today. Catch you tomorrow."
          : 'One at a time. Give me a few seconds and ask again.'
      );
    },
    [abort]
  );

  const finalize = useCallback((): void => {
    const content = fullRef.current.trim();
    const cards = cardsRef.current;
    if (content || cards.length) {
      appendMangaMessage(threadKey, {
        role: 'assistant',
        content,
        ...(cards.length ? { cards } : {}),
      });
    } else if (errorCodeRef.current === 'rate_limited') {
      setError(
        "That's the free companion quota spent for today. Try again later."
      );
    } else {
      setError('I blanked on that one. Try asking again.');
    }
    setDraft(null);
    setBusy(false);
  }, [threadKey]);

  const handleEvent = useCallback((event: SseEvent): void => {
    if (event.type === 'thinking') {
      setDraft((current) =>
        current ? { ...current, thinking: event.label } : current
      );
    } else if (event.type === 'card') {
      cardsRef.current = [...cardsRef.current, event.card];
      setDraft((current) =>
        current ? { ...current, cards: cardsRef.current } : current
      );
    } else if (event.type === 'text_delta') {
      fullRef.current += event.text;
      setDraft((current) =>
        current
          ? { ...current, text: fullRef.current, thinking: null }
          : current
      );
    } else if (event.type === 'error') {
      errorCodeRef.current = event.code;
    }
  }, []);

  const fallbackNostream = useCallback(
    async (payload: unknown): Promise<boolean> => {
      try {
        const response = await fetch('/api/manga/companion?nostream=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (response.status === 503) {
          setConfigured('no');
          abort();
          return true;
        }
        if (response.status === 429) {
          await abort429(response);
          return true;
        }
        if (!response.ok) {
          abort('I lost the signal. Give it another shot.');
          return true;
        }
        const data = (await response.json()) as {
          reply?: string;
          cards?: CompanionCard[];
        };
        fullRef.current = data.reply || '';
        cardsRef.current = data.cards || [];
        if (fullRef.current || cardsRef.current.length) return false;
        abort('I blanked on that one. Try asking again.');
        return true;
      } catch {
        abort('I lost the signal. Give it another shot.');
        return true;
      }
    },
    [abort, abort429]
  );

  const ask = useCallback(
    async (text: string, recap: boolean): Promise<void> => {
      if (busy) return;
      const userMessage = recap ? 'Recap so far' : text;
      const history = messages.slice(-10);
      appendMangaMessage(threadKey, { role: 'user', content: userMessage });
      setInput('');
      setError(null);
      setBusy(true);
      fullRef.current = '';
      cardsRef.current = [];
      errorCodeRef.current = null;
      setDraft({
        text: '',
        cards: [],
        thinking: visionReady && pageUrl ? 'looking at this page…' : null,
      });

      let frameData = '';
      if (
        !recap &&
        visionReady &&
        pageUrl &&
        !prefs.tone.includes('unhinged')
      ) {
        try {
          frameData = await capturePage(pageUrl);
        } catch {
          setError(
            "I couldn't attach this page, so I won't guess from the art."
          );
        }
      }

      const payload = {
        anilistId,
        title,
        chapterNum,
        totalChapters,
        pageIndex,
        tone: prefs.tone,
        mature: prefs.mature,
        roster,
        messages: history.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        message: text,
        recap,
        ...(frameData ? { frameData } : {}),
      };

      try {
        const response = await fetch('/api/manga/companion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (response.status === 503) {
          setConfigured('no');
          abort();
          return;
        }
        if (response.status === 429) {
          await abort429(response);
          return;
        }
        if (!response.ok || !response.body) {
          const stopped = await fallbackNostream(payload);
          if (!stopped) finalize();
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        // eslint-disable-next-line no-constant-condition
        while (true) {
          // eslint-disable-next-line no-await-in-loop
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf('\n');
          while (newline >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf('\n');
            if (line.startsWith('data:')) {
              try {
                handleEvent(JSON.parse(line.slice(5).trim()) as SseEvent);
              } catch {
                /* partial frame */
              }
            }
          }
        }
        finalize();
      } catch {
        if (!fullRef.current && cardsRef.current.length === 0) {
          const stopped = await fallbackNostream(payload);
          if (!stopped) finalize();
        } else {
          finalize();
        }
      }
    },
    [
      busy,
      threadKey,
      messages,
      visionReady,
      pageUrl,
      prefs.tone,
      prefs.mature,
      anilistId,
      title,
      chapterNum,
      totalChapters,
      pageIndex,
      roster,
      abort,
      abort429,
      fallbackNostream,
      finalize,
      handleEvent,
    ]
  );

  const send = (): void => {
    const text = input.trim();
    if (text) ask(text, false);
  };

  const renderDraft = (current: Draft): JSX.Element => {
    if (current.thinking && !current.text) {
      return (
        <span className="inline-flex min-h-[36px] items-center gap-2 rounded-2xl rounded-bl-sm border border-line/50 bg-surface/70 px-3 text-xs text-muted">
          <SparklesIcon className="h-3.5 w-3.5 animate-pulse text-accent motion-reduce:animate-none" />
          {current.thinking}
        </span>
      );
    }
    if (current.text) {
      return (
        <p className="max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm border border-line/50 bg-surface/70 px-3 py-2 text-sm leading-relaxed text-fg">
          {current.text}
          <span className="ml-px inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-accent align-baseline motion-reduce:animate-none" />
        </p>
      );
    }
    return (
      <span className="flex gap-1 rounded-2xl rounded-bl-sm border border-line/50 bg-surface/70 px-3 py-3">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="h-1.5 w-1.5 animate-pulse rounded-full bg-faint motion-reduce:animate-none"
            style={{ animationDelay: `${dot * 150}ms` }}
          />
        ))}
      </span>
    );
  };

  return (
    <>
      <button
        type="button"
        aria-label="Open reading companion"
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/90 transition [touch-action:manipulation] hover:bg-white/10 active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <SparklesIcon className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex sm:items-center sm:justify-end">
          <button
            type="button"
            aria-label="Close reading companion"
            onClick={close}
            className="absolute inset-0 bg-black/60 [backdrop-filter:blur(2px)] [-webkit-backdrop-filter:blur(2px)]"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label="Reading companion"
            className="absolute inset-x-0 bottom-0 z-10 flex h-[85svh] max-h-[85svh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-white/10 bg-canvas-2/95 text-fg shadow-lift [backdrop-filter:blur(8px)] [-webkit-backdrop-filter:blur(8px)] motion-safe:animate-rise sm:relative sm:inset-auto sm:m-4 sm:w-[26rem] sm:rounded-2xl sm:border"
          >
            <header className="flex min-h-[64px] items-center justify-between gap-3 border-b border-line/50 px-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-aurora text-accent-ink shadow-glow">
                  <SparklesIcon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="truncate font-display text-sm font-bold">
                    Reading companion
                  </p>
                  <p className="truncate text-xs text-muted">
                    ch. {chapterNum || '?'} · page {pageIndex + 1}
                    {visionReady && pageUrl ? ' · page-aware' : ''}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <TonePicker />
                <button
                  type="button"
                  aria-label="Close"
                  onClick={close}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-muted transition [touch-action:manipulation] hover:bg-surface active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  <XIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </header>

            {configured === 'no' ? (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <SparklesIcon className="h-7 w-7 text-accent" />
                <p className="mt-3 font-display text-sm font-bold">
                  Companion is offstage
                </p>
                <p className="mt-1 max-w-[32ch] text-sm leading-relaxed text-muted">
                  Add a Google AI Studio key to{' '}
                  <code className="rounded bg-surface px-1 py-0.5 text-xs text-fg">
                    COMPANION_API_KEY
                  </code>{' '}
                  and restart.
                </p>
              </div>
            ) : (
              <div
                ref={scrollRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3"
              >
                {messages.length === 0 && !draft && (
                  <div className="flex h-full flex-col items-center justify-center px-3 text-center">
                    <p className="font-display text-sm font-bold">
                      Same page, next seat
                    </p>
                    <p className="mt-1 max-w-[34ch] text-sm leading-relaxed text-muted">
                      Ask who is in the panel or react to the chapter. I check
                      the page and cast before naming anyone.
                    </p>
                  </div>
                )}

                {messages.map((message, index) => (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={index}
                    className={`flex flex-col gap-2 ${
                      message.role === 'user' ? 'items-end' : 'items-start'
                    }`}
                  >
                    {message.role === 'assistant' && message.cards && (
                      <CompanionCards cards={message.cards} target="_blank" />
                    )}
                    {message.content && (
                      <p
                        className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                          message.role === 'user'
                            ? 'max-w-[85%] rounded-br-sm bg-aurora text-accent-ink'
                            : 'max-w-[92%] rounded-bl-sm border border-line/50 bg-surface/70 text-fg'
                        }`}
                      >
                        {message.content}
                      </p>
                    )}
                  </div>
                ))}

                {draft && (
                  <div
                    className="flex flex-col items-start gap-2"
                    aria-live="polite"
                  >
                    {draft.cards.length > 0 && (
                      <CompanionCards cards={draft.cards} target="_blank" />
                    )}
                    {renderDraft(draft)}
                  </div>
                )}

                {error && (
                  <p role="status" className="text-center text-xs text-accent">
                    {error}
                  </p>
                )}
              </div>
            )}

            {configured !== 'no' && (
              <footer
                className="border-t border-line/50 px-3 pt-2.5"
                style={{
                  paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))',
                }}
              >
                <button
                  type="button"
                  onClick={() => ask('', true)}
                  disabled={busy}
                  className="mb-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-line/60 bg-surface/60 px-3 text-xs font-semibold text-muted transition [touch-action:manipulation] hover:border-accent/50 hover:text-fg active:scale-95 disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100"
                >
                  <SparklesIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  Recap so far
                </button>
                <label htmlFor="reading-companion-input" className="sr-only">
                  Talk about this page
                </label>
                <div className="flex items-end gap-2">
                  <textarea
                    id="reading-companion-input"
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    maxLength={1500}
                    disabled={busy}
                    placeholder="Ask about this page…"
                    className="max-h-28 min-h-[44px] min-w-0 flex-1 resize-none rounded-xl border border-line/60 bg-surface/60 px-3 py-2 text-base text-fg placeholder:text-faint focus:border-accent/70 focus:outline-none disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={send}
                    disabled={busy || !input.trim()}
                    aria-label="Send"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-aurora text-accent-ink shadow-glow transition [touch-action:manipulation] active:scale-95 disabled:opacity-40 motion-reduce:transition-none motion-reduce:active:scale-100"
                  >
                    <PaperAirplaneIcon
                      className="h-5 w-5 rotate-90"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <p className="mt-1.5 px-1 text-xs text-faint">
                  Spoiler limit: chapter {chapterNum || '?'}. Page identity uses
                  the current image plus AniList.
                </p>
              </footer>
            )}
          </section>
        </div>
      )}
    </>
  );
};

export default ReadingCompanion;
