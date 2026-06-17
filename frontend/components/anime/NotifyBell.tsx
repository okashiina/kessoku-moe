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

// Per-anime "ping me when a new episode airs" bell. Sits in the anime page
// action row next to status + rating, matching their pill language. Renders
// nothing when push can't work on this build/browser, so the row stays clean.

type Hint = '' | 'denied' | 'unsupported' | 'retry' | 'error';

const HINT_TEXT: Record<Exclude<Hint, ''>, string> = {
  denied: 'Allow notifications in your browser to get episode alerts.',
  unsupported: "This browser can't do push yet.",
  retry: 'Easy there. Try again in a moment.',
  error: "That didn't take. Try again.",
};

const NotifyBell: React.FC<{ animeId: number }> = ({ animeId }) => {
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
    fetch(`/api/push/prefs?deviceId=${encodeURIComponent(deviceId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data && Array.isArray(data.bells)) {
          setOn(data.bells.includes(animeId));
        }
      })
      .catch(() => {
        /* prefs unavailable — leave the bell off, no noise */
      });
    return () => {
      alive = false;
    };
  }, [animeId]);

  if (!canPush) return null;

  const setBell = async (next: boolean) => {
    const token = getToken();
    const res = await fetch('/api/push/bell', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        deviceId: getDeviceId(),
        anilistId: animeId,
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

  const onClick = async () => {
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
        aria-label={on ? 'Stop notifying' : 'Notify me about new episodes'}
        className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas active:scale-95 disabled:opacity-60 motion-reduce:transition-none motion-reduce:active:scale-100 ${
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
          className="absolute left-0 top-full mt-1.5 w-56 text-xs leading-relaxed text-muted"
        >
          {hintText}
        </p>
      )}
    </div>
  );
};

export default NotifyBell;
