import { useEffect, useMemo, useState } from 'react';

import { AnimeInfoFragment } from '@animeflix/api/aniList';
import { NextSeo } from 'next-seo';

import AniListSignInBanner from '@components/AniListSignInBanner';
import Card from '@components/anime/Card';
import Header from '@components/Header';
import MangaListSection from '@components/manga/MangaListSection';
import progressBar from '@components/Progress';
import useWatchlist from '@hooks/useWatchlist';
import { getAllAnimeByIds } from '@utility/animeByIds';
import { type AniStatus, effectiveStatus } from '@utility/listStatus';

type Tab = 'all' | AniStatus;

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'CURRENT', label: 'Watching' },
  { value: 'PLANNING', label: 'Plan to Watch' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PAUSED', label: 'On Hold' },
  { value: 'DROPPED', label: 'Dropped' },
];

const Watchlist = () => {
  progressBar.finish();

  const ids = useWatchlist();
  const [media, setMedia] = useState<AnimeInfoFragment[]>([]);
  const [tab, setTab] = useState<Tab>('all');
  const [view, setView] = useState<'anime' | 'manga'>('anime');

  // Join into a primitive so the effect only refires when the id set changes,
  // not on every render's fresh array reference.
  const idKey = ids.join(',');

  useEffect(() => {
    const list = idKey
      .split(',')
      .filter(Boolean)
      .map((id) => Number(id));

    let cancelled = false;
    if (list.length === 0) {
      setMedia([]);
    } else {
      // Already ordered to match `list` (most-recent-first), no 50-cap.
      getAllAnimeByIds(list)
        .then((resolved) => {
          if (!cancelled) setMedia(resolved);
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [idKey]);

  // Filter by the effective list status (explicit override or derived from
  // progress); "all" shows everything.
  const filtered = useMemo(
    () =>
      tab === 'all'
        ? media
        : media.filter((anime) => effectiveStatus(anime.id) === tab),
    [media, tab]
  );

  return (
    <>
      <NextSeo title="My List | kessoku moe" />

      <Header />

      <main className="mx-auto w-full max-w-screen-2xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
        {/* Heading with accent tick */}
        <div className="mb-6 flex items-center gap-2.5">
          <span className="h-7 w-1 rounded-full bg-aurora" aria-hidden />
          <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">
            My List
          </h1>
        </div>

        {/* Signed-out nudge to sync with AniList (hides when logged in). */}
        {view === 'anime' && <AniListSignInBanner />}

        {/* Anime / Manga switch */}
        <div className="mb-6 flex gap-2">
          {(['anime', 'manga'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`rounded-full px-5 py-2 text-sm font-semibold capitalize transition ${
                view === v
                  ? 'bg-aurora text-accent-ink shadow-glow'
                  : 'bg-surface text-muted hover:text-fg'
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {view === 'manga' ? (
          <MangaListSection />
        ) : (
          <>
            {/* Status tabs */}
            <div className="mb-8 flex flex-wrap gap-2">
              {TABS.map(({ value, label }) => {
                const active = tab === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTab(value)}
                    aria-pressed={active}
                    className={`rounded-full px-4 py-1.5 text-xs font-medium transition duration-200 sm:text-sm ${
                      active
                        ? 'bg-aurora text-accent-ink shadow-glow'
                        : 'bg-surface text-muted hover:text-fg'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {filtered.length > 0 ? (
              <div className="grid grid-cols-3 justify-items-center gap-4 sm:grid-cols-4 lg:grid-cols-6">
                {filtered.map((anime) => (
                  <Card key={anime.id} anime={anime} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-line/50 bg-surface/30 px-6 py-20 text-center">
                <p className="font-display text-lg font-bold text-fg">
                  {media.length > 0 ? 'Nothing here yet' : 'Your list is empty'}
                </p>
                <p className="mt-2 max-w-sm text-sm text-muted">
                  {media.length > 0
                    ? 'No saved titles match this tab. Try another one.'
                    : 'Tap the bookmark on any title to save it here.'}
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
};

export default Watchlist;
