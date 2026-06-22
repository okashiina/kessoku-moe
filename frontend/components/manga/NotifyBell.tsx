import { useEffect, useState } from 'react';

import { BellIcon } from '@heroicons/react/outline';
import { BellIcon as BellSolidIcon } from '@heroicons/react/solid';

import { getToken } from '@utility/anilistAuth';
import {
  enablePush,
  getDeviceId,
  pushConfigured,
  pushSupported,
} from '@utility/push/client';

// Per-manga "ping me when a new chapter drops" bell. Mirrors anime/NotifyBell:
// same pill language, same capability detection, same enablePush flow. Sits in
// the manga page action row next to the bookmark/status shelf. Renders nothing
// when push can't work on this build/browser (e.g. iOS Safari that isn't an
// installed PWA), so the row stays clean instead of showing a dead button.

type Hint = '' | 'denied' | 'unsupported' | 'retry' | 'error';

const HINT_TEXT: Record<Exclude<Hint, ''>, string> = {
  denied: 'Allow notifications in your browser to get chapter alerts.',
  unsupported: "This browser can't do push yet.",
  retry: 'Easy there. Try again in a moment.',
  error: "That didn't take. Try again.",
};

const NotifyBell: React.FC<{ mangaId: number; title?: string }> = ({
  mangaId,
  title,
}) => {
  // SSR-safe: assume push works until we hydrate, then re-check in the effect.
  const [canPush, setCanPush] = useState(true);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<Hint>('');

  // Hydrate capability + current bell state on the client only.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const ok = pushSupported() && pushConfigured();
    setCanPush(ok);
    if (!ok) return undefined;

    let alive = true;
    const deviceId = getDeviceId();
    fetch(
      `/api/push/manga-bell?anilistId=${mangaId}&deviceId=${encodeURIComponent(
        deviceId
      )}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data && typeof data.on === 'boolean') setOn(data.on);
      })
      .catch(() => {
        /* state unavailable — leave the bell off, no noise */
      });
    return () => {
      alive = false;
    };
  }, [mangaId]);

  if (!canPush) return null;

  const setBell = async (next: boolean): Promise<boolean> => {
    const token = getToken();
    const res = await fetch('/api/push/manga-bell', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        deviceId: getDeviceId(),
        anilistId: mangaId,
        title,
        on: next,
      }),
    });
    if (res.status === 429) {
      setHint('retry');
      return false;
    }
    if (!res.ok) {
      setHint('error');
      return false;
    }
    return true;
  };

  const onClick = async (): Promise<void> => {
    if (busy) return;
    setHint('');
    setBusy(true);
    try {
      const next = !on;
      // Turning ON: always (re)ensure a live subscription first. enablePush is
      // idempotent (reuses an existing browser subscription) and self-heals the
      // case where permission is already granted but the server has no row.
      if (next) {
        const status = await enablePush();
        if (status === 'denied') {
          setHint('denied');
          return;
        }
        if (status !== 'granted') {
          setHint('unsupported');
          return;
        }
      }

      setOn(next); // optimistic
      const ok = await setBell(next);
      if (!ok) setOn(!next); // revert
    } catch {
      setHint('error');
    } finally {
      setBusy(false);
    }
  };

  const Icon = on ? BellSolidIcon : BellIcon;
  const hintText = hint ? HINT_TEXT[hint] : '';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-pressed={on}
        aria-label={on ? 'Stop notifying' : 'Notify me about new chapters'}
        style={{ touchAction: 'manipulation' }}
        className={`flex min-h-[44px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-95 disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100 ${
          on
            ? 'border-accent/60 bg-surface/70 text-fg hover:border-accent'
            : 'border-line/70 bg-surface/70 text-fg hover:border-accent/60'
        }`}
      >
        <span className={on ? 'text-accent' : 'text-muted'}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        {on ? 'Notifying' : 'Notify me'}
      </button>

      {hintText && (
        <p
          role="status"
          className="absolute left-0 top-full mt-1.5 w-48 max-w-[calc(100vw-2rem)] text-xs leading-relaxed text-muted"
        >
          {hintText}
        </p>
      )}
    </div>
  );
};

export default NotifyBell;
