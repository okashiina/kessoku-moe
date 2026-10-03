import { useEffect, useState } from 'react';

import AniListBenefitsModal from '@components/AniListBenefitsModal';
import useAniListAuth from '@hooks/useAniListAuth';
import { clientId } from '@utility/anilistAuth';

// A signed-out nudge for the /watchlist page (and anywhere a list lives). Opens
// the same benefits modal as the header. Hides itself when logged in or when no
// AniList client id is configured. Mounted-guarded so a logged-in viewer never
// sees it flash on hydration.
const AniListSignInBanner: React.FC = () => {
  const { isLoggedIn, login } = useAniListAuth();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !clientId() || isLoggedIn) return null;

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-fg">
            Carry your list everywhere
          </p>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">
            Sign in with AniList so your watchlist and progress follow you,
            phone to laptop.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center self-start rounded-[5px] bg-accent px-5 text-sm font-bold text-accent-ink transition hover:brightness-110 sm:self-auto"
        >
          Sign in
        </button>
      </div>

      <AniListBenefitsModal
        open={open}
        onClose={() => setOpen(false)}
        onContinue={login}
      />
    </>
  );
};

export default AniListSignInBanner;
