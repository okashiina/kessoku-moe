import { useEffect, useMemo, useState } from 'react';

import Link from 'next/link';

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

const chipClass = (active: boolean) =>
  `min-h-[44px] rounded-[5px] px-[17px] py-[10px] text-sm font-bold capitalize transition [touch-action:manipulation] ${
    active
      ? 'bg-accent text-accent-ink hover:bg-accent hover:text-accent-ink'
      : 'text-[#bfb2c1] hover:bg-[#332735] hover:text-fg'
  }`;

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
        <div className="mb-8 flex items-end justify-between gap-6">
          <h1 className="font-display text-[clamp(32px,4vw,52px)] font-extrabold leading-[1.1] tracking-[-0.05em] text-fg">
            My List
          </h1>
          <Link href="/wrapped" passHref>
            <a
              className="inline-flex min-h-[44px] shrink-0 items-center text-[13px] font-bold text-accent transition [touch-action:manipulation] hover:brightness-110"
              aria-label="See your reading and watching Wrapped"
            >
              Wrapped
            </a>
          </Link>
        </div>

        {/* Signed-out nudge to sync with AniList (hides when logged in). */}
        {view === 'anime' && <AniListSignInBanner />}

        <div className="mb-6 flex gap-2">
          {(['anime', 'manga'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={chipClass(view === v)}
            >
              {v}
            </button>
          ))}
        </div>

        {view === 'manga' ? (
          <MangaListSection />
        ) : (
          <>
            <div className="mb-8 flex flex-wrap gap-2">
              {TABS.map(({ value, label }) => {
                const active = tab === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTab(value)}
                    aria-pressed={active}
                    className={chipClass(active)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {filtered.length > 0 ? (
              <div className="grid grid-cols-2 gap-[22px] md:grid-cols-3 lg:grid-cols-5">
                {filtered.map((anime) => (
                  <Card key={anime.id} anime={anime} fluid />
                ))}
              </div>
            ) : (
              <div className="flex min-h-[340px] flex-col items-center justify-center gap-4 px-6 py-20 text-center">
                <h2 className="font-display text-[26px] font-extrabold text-fg">
                  {media.length > 0 ? 'Nothing here yet' : 'Your list is empty'}
                </h2>
                <p className="max-w-[420px] text-sm leading-[1.7] text-[#bfb2c1]">
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
