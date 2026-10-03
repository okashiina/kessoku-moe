import { useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/router';

import { CogIcon, UserCircleIcon } from '@heroicons/react/outline';

import AniListBenefitsModal from '@components/AniListBenefitsModal';
import NotificationBell from '@components/NotificationBell';
import RoomJoinLauncher from '@components/RoomJoinLauncher';
import useAniListAuth from '@hooks/useAniListAuth';
import useNotifications from '@hooks/useNotifications';
import styles from '@styles/AccountMenu.module.css';
import { clientId } from '@utility/anilistAuth';
import { setTitleLang, useTitleLang, type TitleLang } from '@utility/titleLang';

// Header account + display-preferences menu. The avatar (or a generic account
// icon when signed out) opens a dropdown with the title-language toggle — a
// display pref EVERYONE gets — plus the AniList sign in / out action. The whole
// control renders even without an AniList client id (auth section just hides),
// so the title toggle is always reachable.

const TITLE_OPTIONS: { id: TitleLang; label: string }[] = [
  { id: 'romaji', label: 'Romaji' },
  { id: 'english', label: 'English' },
];

const AniListAuthButton: React.FC = () => {
  const router = useRouter();
  const { session, isLoggedIn, login, logout } = useAniListAuth();
  const { unread } = useNotifications();
  const lang = useTitleLang();
  const [open, setOpen] = useState(false);
  const [benefitsOpen, setBenefitsOpen] = useState(false);
  const [mobileAction, setMobileAction] = useState<
    'room' | 'notifications' | null
  >(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hasAniList = Boolean(clientId());
  const user = session?.user;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        wrapRef.current?.contains(document.activeElement)
      ) {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  useEffect(() => {
    const close = () => setOpen(false);
    router.events.on('routeChangeStart', close);
    return () => router.events.off('routeChangeStart', close);
  }, [router.events]);

  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true });
    else setMobileAction(null);
  }, [open]);

  let avatarInner: React.ReactNode;
  if (isLoggedIn && user?.avatar) {
    avatarInner = (
      // eslint-disable-next-line @next/next/no-img-element -- small remote avatar; next/image adds no value here
      <img
        src={user.avatar}
        alt={user.name}
        className="h-full w-full object-cover"
      />
    );
  } else if (isLoggedIn && user) {
    avatarInner = (
      <span className="grid h-full w-full place-items-center bg-surface-2 text-sm font-semibold text-fg">
        {user.name.charAt(0).toUpperCase()}
      </span>
    );
  } else {
    avatarInner = (
      <span className="grid h-full w-full place-items-center bg-surface text-muted">
        <UserCircleIcon className="h-6 w-6" />
      </span>
    );
  }

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-controls={open ? 'account-settings-panel' : undefined}
        aria-expanded={open}
        aria-label={
          unread > 0
            ? `Account and settings, ${unread} unread notifications`
            : 'Account and settings'
        }
        title={isLoggedIn && user ? user.name : 'Account and settings'}
        className="relative flex h-11 w-11 items-center justify-center rounded-full transition [touch-action:manipulation] hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:bg-surface-2 motion-reduce:transition-none"
      >
        <span className="block h-9 w-9 overflow-hidden rounded-full ring-1 ring-line/60">
          {avatarInner}
        </span>
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-canvas lg:hidden"
          />
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          id="account-settings-panel"
          role="region"
          aria-label="Account and settings"
          tabIndex={-1}
          className={styles.panel}
        >
          {isLoggedIn && user && (
            <div className="border-b border-line/50 px-4 py-3">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-faint">
                Signed in as
              </p>
              <p className="truncate text-sm font-semibold text-fg">
                {user.name}
              </p>
              <p className="mt-0.5 text-xs text-muted">Syncing with AniList</p>
            </div>
          )}

          <div className="space-y-2 border-b border-line/50 p-2 empty:hidden lg:hidden">
            <RoomJoinLauncher
              variant="account"
              expanded={mobileAction === 'room'}
              onExpandedChange={(expanded) =>
                setMobileAction(expanded ? 'room' : null)
              }
            />
            <NotificationBell
              variant="account"
              expanded={mobileAction === 'notifications'}
              onExpandedChange={(expanded) =>
                setMobileAction(expanded ? 'notifications' : null)
              }
            />
          </div>

          {/* Title language — a display pref everyone gets, signed in or not. */}
          <div className="border-b border-line/50 px-4 py-3">
            <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-faint">
              Title language
            </p>
            <div
              className="flex gap-2"
              role="group"
              aria-label="Title language"
            >
              {TITLE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setTitleLang(o.id)}
                  aria-pressed={lang === o.id}
                  className={`min-h-[44px] flex-1 rounded-lg px-2.5 py-2 text-sm font-semibold transition [touch-action:manipulation] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 motion-reduce:transition-none ${
                    lang === o.id
                      ? 'bg-aurora text-accent-ink shadow-glow'
                      : 'text-muted hover:bg-surface/60 hover:text-fg'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Full settings page — sync/privacy + display prefs live there. */}
          <Link href="/settings" passHref>
            <a
              onClick={() => setOpen(false)}
              className="flex min-h-[48px] w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-medium text-fg transition [touch-action:manipulation] hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 active:bg-surface-2 motion-reduce:transition-none"
            >
              <CogIcon className="h-4 w-4" />
              Settings
            </a>
          </Link>

          {/* AniList sign in / out — only when a client id is configured. */}
          {hasAniList &&
            (isLoggedIn ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="min-h-[48px] w-full px-4 py-2.5 text-left text-sm font-medium text-fg transition [touch-action:manipulation] hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 active:bg-surface-2 motion-reduce:transition-none"
              >
                Log out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setBenefitsOpen(true);
                }}
                className="min-h-[48px] w-full px-4 py-2.5 text-left text-sm font-medium text-fg transition [touch-action:manipulation] hover:bg-surface/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 active:bg-surface-2 motion-reduce:transition-none"
              >
                Sign in with AniList
              </button>
            ))}
        </div>
      )}

      <AniListBenefitsModal
        open={benefitsOpen}
        onClose={() => setBenefitsOpen(false)}
        onContinue={login}
      />
    </div>
  );
};

export default AniListAuthButton;
