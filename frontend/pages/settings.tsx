import { useState } from 'react';

import { NextSeo } from 'next-seo';

import AniListBenefitsModal from '@components/AniListBenefitsModal';
import Header from '@components/Header';
import progressBar from '@components/Progress';
import useAniListAuth from '@hooks/useAniListAuth';
import { clientId } from '@utility/anilistAuth';
import { setAniListWrite, useAniListWrite } from '@utility/anilistWrite';
import { setTitleLang, useTitleLang, type TitleLang } from '@utility/titleLang';

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
