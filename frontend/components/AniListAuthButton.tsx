import { useEffect, useRef, useState } from 'react';

import { UserCircleIcon } from '@heroicons/react/outline';

import AniListBenefitsModal from '@components/AniListBenefitsModal';
import useAniListAuth from '@hooks/useAniListAuth';
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
  const { session, isLoggedIn, login, logout } = useAniListAuth();
  const lang = useTitleLang();
  const [open, setOpen] = useState(false);
  const [benefitsOpen, setBenefitsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hasAniList = Boolean(clientId());
  const user = session?.user;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

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
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account and settings"
        title={isLoggedIn && user ? user.name : 'Account and settings'}
        className="block h-9 w-9 overflow-hidden rounded-full ring-1 ring-line/60 transition hover:ring-accent/60"
      >
        {avatarInner}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-line/60 bg-canvas/95 shadow-lift ring-1 ring-line/40 backdrop-blur-xl"
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

          {/* Title language — a display pref everyone gets, signed in or not. */}
          <div className="border-b border-line/50 px-4 py-3">
            <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-faint">
              Title language
            </p>
            <div
              className="flex gap-1"
              role="group"
              aria-label="Title language"
            >
              {TITLE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setTitleLang(o.id)}
                  aria-pressed={lang === o.id}
                  className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
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

          {/* AniList sign in / out — only when a client id is configured. */}
          {hasAniList &&
            (isLoggedIn ? (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="w-full px-4 py-2.5 text-left text-sm font-medium text-muted transition hover:bg-surface/60 hover:text-fg"
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
                className="w-full px-4 py-2.5 text-left text-sm font-medium text-muted transition hover:bg-surface/60 hover:text-fg"
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
