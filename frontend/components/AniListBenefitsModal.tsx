import { useEffect, useState } from 'react';

import {
  CheckCircleIcon,
  DeviceMobileIcon,
  TagIcon,
  XIcon,
} from '@heroicons/react/outline';

import { getAniListWrite, setAniListWrite } from '@utility/anilistWrite';

// Sign-in explainer shown before the AniList redirect. It tells the viewer what
// they actually get (sync, auto-counted episodes, status on their profile),
// then "Continue with AniList" runs the real login. Brand voice: dark, cute, a
// little rock. No claims about anything we haven't built.

interface Benefit {
  Icon: (props: { className?: string }) => JSX.Element;
  title: string;
  body: string;
}

const BENEFITS: Benefit[] = [
  {
    Icon: DeviceMobileIcon,
    title: 'One list, every screen',
    body: 'Save it here and it’s on your phone and your laptop too. It’s your AniList list, already in sync.',
  },
  {
    Icon: CheckCircleIcon,
    title: 'Episodes count themselves',
    body: 'Finish an episode and AniList ticks the number up. No logging the same thing twice.',
  },
  {
    Icon: TagIcon,
    title: 'Set the status yourself',
    body: 'Watching, on hold, dropped, done. Tag a title and it lands on your profile.',
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
}

const AniListBenefitsModal: React.FC<Props> = ({
  open,
  onClose,
  onContinue,
}) => {
  // Write consent, chosen here before the redirect. Defaults to whatever is
  // already stored (on for a first sign-in), and is changeable later in Settings.
  const [allowWrite, setAllowWrite] = useState(true);

  useEffect(() => {
    if (open) setAllowWrite(getAniListWrite());
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleContinue = () => {
    setAniListWrite(allowWrite);
    onContinue();
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid animate-fade-in place-items-center bg-canvas/80 px-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="anilist-benefits-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md animate-fade-in rounded-2xl border border-line/60 bg-canvas-2 p-6 shadow-lift sm:p-7"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1 text-faint transition hover:bg-surface/70 hover:text-fg"
        >
          <XIcon className="h-5 w-5" />
        </button>

        {/* Brand mark — the guitar-pick / play icon */}
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface ring-1 ring-line/50">
          {/* eslint-disable-next-line @next/next/no-img-element -- inline brand SVG */}
          <img src="/kessoku-moe-icon.svg" alt="" className="h-7 w-7" />
        </span>

        <h2
          id="anilist-benefits-title"
          className="mt-4 font-display text-xl font-bold tracking-tight text-fg sm:text-2xl"
        >
          Take your list on tour
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          Sign in with AniList and the watchlist you build here rides along with
          your account.
        </p>

        <ul className="mt-6 space-y-4">
          {BENEFITS.map(({ Icon, title, body }) => (
            <li key={title} className="flex gap-3.5">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-accent ring-1 ring-line/40">
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-fg">{title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {/* Write consent. AniList hands out no read-only token, so we gate this
            in the app: off means changes stay on this device, nothing is sent. */}
        <label
          htmlFor="anilist-write-consent"
          className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl border border-line/50 bg-surface/40 p-3.5 transition hover:border-line"
        >
          <input
            id="anilist-write-consent"
            type="checkbox"
            checked={allowWrite}
            onChange={(e) => setAllowWrite(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line bg-surface accent-accent"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg">
              Let kessoku update my AniList
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">
              Your ratings, status, and episode count ride up to your account.
              Leave it off and everything stays on this device.
            </span>
          </span>
        </label>

        <button
          type="button"
          onClick={handleContinue}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-aurora px-5 py-3 text-sm font-semibold text-accent-ink shadow-glow transition duration-200 hover:brightness-110 active:scale-95"
        >
          Continue with AniList
        </button>

        <p className="mt-3 text-center text-xs leading-relaxed text-faint">
          We use your AniList login. Skip it and the app still works, your list
          just stays on this device.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mx-auto mt-2 block text-xs font-medium text-muted transition hover:text-fg"
        >
          Not now
        </button>
      </div>
    </div>
  );
};

export default AniListBenefitsModal;
