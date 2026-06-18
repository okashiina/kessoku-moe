import { useEffect, useState } from 'react';

import { NextSeo } from 'next-seo';

import AniListBenefitsModal from '@components/AniListBenefitsModal';
import Header from '@components/Header';
import progressBar from '@components/Progress';
import useAniListAuth from '@hooks/useAniListAuth';
import { clientId, getToken } from '@utility/anilistAuth';
import { setAniListWrite, useAniListWrite } from '@utility/anilistWrite';
import { effectiveStatus } from '@utility/listStatus';
import {
  enablePush,
  getDeviceId,
  pushConfigured,
  pushStatus,
  pushSupported,
  type PushStatus,
} from '@utility/push/client';
import { setTitleLang, useTitleLang, type TitleLang } from '@utility/titleLang';
import { listWatchlistIds } from '@utility/watchlist';

// Settings: account, sync/privacy, and display preferences in one place. The
// write toggle is the meaningful control here — AniList issues no read-only
// token, so kessoku enforces "stay on this device" in the app (see anilistWrite).

const TITLE_OPTIONS: { id: TitleLang; label: string }[] = [
  { id: 'romaji', label: 'Romaji' },
  { id: 'english', label: 'English' },
];

const Toggle: React.FC<{
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
      checked ? 'bg-aurora shadow-glow' : 'bg-surface-2'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-fg transition-transform duration-200 motion-reduce:transition-none ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <section className="mb-8">
    <h2 className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-wide text-faint">
      {title}
    </h2>
    <div className="divide-y divide-line/40 overflow-hidden rounded-2xl border border-line/50 bg-surface/30">
      {children}
    </div>
  </section>
);

// Shared write helper for the push prefs API: attaches the AniList token when
// present, always carries the deviceId so a signed-out owner is identifiable.
const putJSON = (
  path: string,
  body: Record<string, unknown>
): Promise<Response> => {
  const token = getToken();
  return fetch(path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ deviceId: getDeviceId(), ...body }),
  });
};

// The ids of every saved title whose effective status is "Watching" (CURRENT).
const watchingIds = (): number[] =>
  listWatchlistIds().filter((id) => effectiveStatus(id) === 'CURRENT');

const isIOS = (): boolean =>
  typeof navigator !== 'undefined' &&
  /iphone|ipad|ipod/i.test(navigator.userAgent);

const isStandalone = (): boolean => {
  if (typeof window === 'undefined') return false;
  const displayMode =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  // iOS reports installed-PWA mode via the non-standard navigator.standalone.
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
};

const NotificationsSection: React.FC = () => {
  // SSR-safe defaults; everything browser-facing hydrates in the effect.
  const [supported, setSupported] = useState(true);
  const [browserSupported, setBrowserSupported] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [status, setStatus] = useState<PushStatus>('default');
  const [iosHint, setIosHint] = useState(false);

  const [masterEnabled, setMasterEnabled] = useState(false);
  const [autoWatching, setAutoWatching] = useState(false);
  const [unavailable, setUnavailable] = useState(false); // DB/push not ready (503)
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState(false);
  const [retry, setRetry] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Hydrate capability + server prefs once on the client.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const browserOk = pushSupported();
    const cfg = pushConfigured();
    const ok = browserOk && cfg;
    setBrowserSupported(browserOk);
    setConfigured(cfg);
    setSupported(ok);
    setStatus(pushStatus());
    setIosHint(isIOS() && !isStandalone());
    if (!ok) return undefined;

    // Self-heal: a granted permission with no server subscription is the broken
    // state (an earlier enable that didn't persist). Re-register idempotently so
    // it recovers on load without the user toggling anything.
    if (pushStatus() === 'granted') {
      enablePush().catch(() => {
        /* best-effort; the toggle surfaces a real failure */
      });
    }

    let alive = true;
    fetch(`/api/push/prefs?deviceId=${encodeURIComponent(getDeviceId())}`)
      .then((r) => {
        if (r.status === 503) {
          if (alive) setUnavailable(true);
          return null;
        }
        return r.ok ? r.json() : null;
      })
      .then((data) => {
        if (!alive || !data) return;
        setMasterEnabled(Boolean(data.masterEnabled));
        setAutoWatching(Boolean(data.autoWatching));
      })
      .catch(() => {
        /* leave defaults; the UI just shows everything off */
      });
    return () => {
      alive = false;
    };
  }, []);

  const granted = status === 'granted';
  const masterOn = granted && masterEnabled;

  const flash = (res: Response): boolean => {
    if (res.status === 503) {
      setUnavailable(true);
      return false;
    }
    if (res.status === 429) {
      setRetry(true);
      window.setTimeout(() => setRetry(false), 2500);
      return false;
    }
    return res.ok;
  };

  const toggleMaster = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    setRetry(false);
    setErr(null);
    try {
      // Turning ON: always (re)ensure a live subscription. enablePush is
      // idempotent and self-heals "permission granted but no server row".
      if (next) {
        const s = await enablePush();
        setStatus(s);
        if (s !== 'granted') return; // permission not given — nothing to save
      }
      const res = await putJSON('/api/push/prefs', { masterEnabled: next });
      if (flash(res)) setMasterEnabled(next);
    } catch {
      setErr('Could not turn on notifications here. Reload and try again.');
    } finally {
      setBusy(false);
    }
  };

  const toggleAuto = async (next: boolean) => {
    if (busy || !masterOn) return;
    setBusy(true);
    setRetry(false);
    try {
      const res = await putJSON('/api/push/prefs', { autoWatching: next });
      if (!flash(res)) return;
      setAutoWatching(next);
      // Turning it on: hand the server the current Watching set right away.
      if (next)
        await putJSON('/api/push/watching', { anilistIds: watchingIds() });
    } catch {
      /* no-op */
    } finally {
      setBusy(false);
    }
  };

  // Keep the server's auto-Watching set fresh whenever this page mounts and
  // the feature is already on (the list may have changed since last visit).
  useEffect(() => {
    if (!masterOn || !autoWatching) return;
    putJSON('/api/push/watching', { anilistIds: watchingIds() }).catch(() => {
      /* best-effort sync */
    });
  }, [masterOn, autoWatching]);

  const sendTest = async () => {
    if (busy) return;
    setBusy(true);
    setRetry(false);
    try {
      const token = getToken();
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ deviceId: getDeviceId() }),
      });
      if (flash(res)) {
        setTested(true);
        window.setTimeout(() => setTested(false), 4000);
      }
    } catch {
      /* no-op */
    } finally {
      setBusy(false);
    }
  };

  // States where there's nothing to toggle — show an honest line instead. iOS
  // guidance comes first: in a normal Safari tab the Push APIs simply don't
  // exist (they appear only in an installed PWA), so the fix is "install", not a
  // dead-end "unsupported". Only steer them to install when the site itself is
  // push-ready (VAPID configured), otherwise installing wouldn't help.
  let notice: string | null = null;
  if (iosHint && configured && !granted)
    notice =
      'On iPhone, add kessoku to your Home Screen, then open it from there to turn on alerts.';
  else if (!configured)
    notice = "Notifications aren't switched on for this site yet.";
  else if (!browserSupported)
    notice = "This browser doesn't support push notifications.";
  else if (unavailable) notice = "Notifications aren't available right now.";
  else if (status === 'denied')
    notice = 'Notifications are blocked. Enable them in your browser settings.';

  return (
    <Section title="Notifications">
      {notice && (
        <div className="px-4 py-4">
          <p className="text-xs leading-relaxed text-muted">{notice}</p>
        </div>
      )}

      {supported && !unavailable && status !== 'denied' && (
        <>
          {/* Master switch */}
          <div className="flex items-start gap-4 px-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">
                New-episode alerts
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                We ping this device the moment a new episode of a show you
                follow hits the stage.
              </p>
              {retry && (
                <p className="mt-2 text-[0.7rem] font-medium text-faint">
                  Easy there. Try again in a moment.
                </p>
              )}
              {err && (
                <p className="mt-2 text-[0.7rem] font-medium text-rose-400">
                  {err}
                </p>
              )}
            </div>
            <Toggle
              checked={masterOn}
              onChange={toggleMaster}
              label="New-episode alerts"
            />
          </div>

          {/* Auto from Watching */}
          <div
            className={`flex items-start gap-4 px-4 py-4 ${
              masterOn ? '' : 'opacity-50'
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">
                Alert everything I&apos;m watching
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Every show in your Watching list gets alerts on its own. Your
                per-show bells still work whatever this is set to.
              </p>
            </div>
            <Toggle
              checked={autoWatching && masterOn}
              onChange={toggleAuto}
              label="Alert everything I'm watching"
            />
          </div>

          {/* Send a test */}
          {granted && (
            <div className="flex items-center justify-between gap-4 px-4 py-4">
              <p className="text-xs text-muted">
                {tested
                  ? 'Sent. Check your notifications.'
                  : 'Make sure it reaches you.'}
              </p>
              <button
                type="button"
                onClick={sendTest}
                disabled={busy}
                className="shrink-0 text-xs font-semibold text-accent transition hover:brightness-110 disabled:opacity-60"
              >
                Send a test
              </button>
            </div>
          )}
        </>
      )}
    </Section>
  );
};

const Settings = () => {
  progressBar.finish();

  const { session, isLoggedIn, login, logout } = useAniListAuth();
  const write = useAniListWrite();
  const lang = useTitleLang();
  const [benefitsOpen, setBenefitsOpen] = useState(false);
  const hasAniList = Boolean(clientId());
  const user = session?.user;

  return (
    <>
      <NextSeo title="Settings | kessoku moe" />

      <Header />

      <main className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="h-7 w-1 rounded-full bg-aurora" aria-hidden />
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            Settings
          </h1>
        </div>

        {/* Account */}
        <Section title="Account">
          {isLoggedIn && user ? (
            <div className="flex items-center gap-3.5 px-4 py-4">
              <span className="h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-line/60">
                {user.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small remote avatar
                  <img
                    src={user.avatar}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center bg-surface-2 text-sm font-semibold text-fg">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">
                  {user.name}
                </p>
                <p className="text-xs text-muted">Connected to AniList</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="shrink-0 rounded-full border border-line/70 px-3.5 py-1.5 text-xs font-semibold text-muted transition hover:border-line hover:text-fg"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">
                  No account connected
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  {hasAniList
                    ? 'Sign in with AniList to carry your list across devices.'
                    : 'AniList sign-in is not set up on this build.'}
                </p>
              </div>
              {hasAniList && (
                <button
                  type="button"
                  onClick={() => setBenefitsOpen(true)}
                  className="shrink-0 rounded-full bg-aurora px-4 py-2 text-sm font-semibold text-accent-ink shadow-glow transition hover:brightness-110 active:scale-95"
                >
                  Connect AniList
                </button>
              )}
            </div>
          )}
        </Section>

        {/* Sync & privacy — the write toggle. */}
        <Section title="Sync & privacy">
          <div className="flex items-start gap-4 px-4 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">
                Let kessoku update my AniList
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                On, your ratings, status, and episode count sync up to your
                account. Off, every change stays on this device and nothing is
                sent. AniList has no read-only login, so we keep this switch in
                your hands here.
              </p>
              {!isLoggedIn && (
                <p className="mt-2 text-[0.7rem] font-medium text-faint">
                  Takes effect once you connect AniList.
                </p>
              )}
            </div>
            <Toggle
              checked={write}
              onChange={setAniListWrite}
              label="Let kessoku update my AniList"
            />
          </div>
        </Section>

        {/* Notifications — Web Push for new episodes. */}
        <NotificationsSection />

        {/* Display */}
        <Section title="Display">
          <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">Title language</p>
              <p className="mt-0.5 text-xs text-muted">
                How show titles read across the app.
              </p>
            </div>
            <div
              className="flex gap-1 rounded-full bg-surface-2/60 p-1"
              role="group"
              aria-label="Title language"
            >
              {TITLE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setTitleLang(o.id)}
                  aria-pressed={lang === o.id}
                  className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                    lang === o.id
                      ? 'bg-aurora text-accent-ink shadow-glow'
                      : 'text-muted hover:text-fg'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </Section>
      </main>

      <AniListBenefitsModal
        open={benefitsOpen}
        onClose={() => setBenefitsOpen(false)}
        onContinue={login}
      />
    </>
  );
};

export default Settings;
