import { useEffect, useState } from 'react';

import { useRouter } from 'next/router';

import { NextSeo } from 'next-seo';

import { setSession } from '@utility/anilistAuth';
import { fetchViewer } from '@utility/anilistSync';

// AniList authorization-code landing page. AniList redirects here with a `code`
// query param; we hand it to our server route to exchange for an access token
// (using the client secret server-side), then resolve the viewer, persist the
// session, and bounce home.
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

const AniListCallback = () => {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) {
      setFailed(true);
      return;
    }

    const finish = async () => {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const res = await fetch('/api/auth/anilist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirectUri }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      const { access_token: token, expires_in: expiresIn } = await res.json();
      const viewer = token ? await fetchViewer(token) : null;
      if (!token || !viewer) {
        setFailed(true);
        return;
      }
      setSession({
        token,
        expiresAt: Date.now() + (expiresIn ? expiresIn * 1000 : ONE_YEAR_MS),
        user: viewer.user,
        scoreFormat: viewer.scoreFormat,
      });
      router.replace('/home');
    };

    finish();
  }, [router]);

  return (
    <>
      <NextSeo title="Signing in | kessoku moe" />
      <main className="grid min-h-screen place-items-center px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          {failed ? (
            <>
              <p className="font-display text-lg font-bold text-fg">
                That didn&apos;t go through
              </p>
              <p className="max-w-sm text-sm text-muted">
                The AniList sign-in didn&apos;t complete. Head back and try once
                more.
              </p>
              <button
                type="button"
                onClick={() => router.replace('/home')}
                className="rounded-full bg-aurora px-5 py-2 text-sm font-semibold text-accent-ink shadow-glow transition active:scale-95"
              >
                Back home
              </button>
            </>
          ) : (
            <>
              <span className="h-9 w-9 animate-spin rounded-full border-2 border-line border-t-accent" />
              <p className="text-sm text-muted">Linking your AniList…</p>
            </>
          )}
        </div>
      </main>
    </>
  );
};

export default AniListCallback;
