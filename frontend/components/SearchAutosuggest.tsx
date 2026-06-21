import { useEffect, useMemo, useRef, useState } from 'react';

import { useRouter } from 'next/router';

import { SearchIcon } from '@heroicons/react/outline';

import useMangaSuggest, { MangaSuggestion } from '@hooks/useMangaSuggest';
import useSearchSuggest, { Suggestion } from '@hooks/useSearchSuggest';
import { pickTitle, useTitleLang } from '@utility/titleLang';

const animeLabel = (s: Suggestion): string => {
  const parts = [s.format, s.seasonYear ? String(s.seasonYear) : null].filter(
    Boolean
  );
  return parts.join(' · ');
};

const originLabel = (country: string | null): string => {
  if (country === 'KR') return 'Manhwa';
  if (country === 'CN' || country === 'TW') return 'Manhua';
  if (country === 'JP') return 'Manga';
  return 'Comic';
};

const mangaLabel = (m: MangaSuggestion): string => {
  const parts = [m.format, originLabel(m.countryOfOrigin)].filter(Boolean);
  return parts.join(' · ');
};

// A single, type-tagged entry so arrow-key navigation can run over the flat
// concatenation of both groups while we still render them as labelled sections.
type FlatItem = { key: string; href: string };

const SearchAutosuggest: React.FC = () => {
  const router = useRouter();
  const lang = useTitleLang();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { results: animeResults, loading: animeLoading } =
    useSearchSuggest(term);
  const { results: mangaResults, loading: mangaLoading } =
    useMangaSuggest(term);
  const trimmed = term.trim();
  const showPanel = open && trimmed.length >= 2;
  const loading = animeLoading || mangaLoading;
  const hasResults = animeResults.length > 0 || mangaResults.length > 0;

  // Flat list (anime first, then manga) that the keyboard highlight walks.
  const flat = useMemo<FlatItem[]>(
    () => [
      ...animeResults.map((s) => ({
        key: `anime-${s.id}`,
        href: `/anime/${s.id}`,
      })),
      ...mangaResults.map((m) => ({
        key: `manga-${m.id}`,
        href: `/manga/${m.id}`,
      })),
    ],
    [animeResults, mangaResults]
  );

  // Reset the keyboard highlight whenever the result set changes.
  useEffect(() => setActive(-1), [flat]);

  // Close on click/tap outside the search box.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setActive(-1);
    router.push(href);
  };

  const submitFull = () => {
    if (trimmed) go(`/search?keyword=${encodeURIComponent(trimmed)}`);
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (active >= 0 && flat[active]) go(flat[active].href);
      else submitFull();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  const activeKey = active >= 0 ? flat[active]?.key : undefined;

  return (
    <div
      ref={wrapRef}
      className="relative ml-auto w-full min-w-0 max-w-xs sm:max-w-sm"
    >
      <div className="flex min-w-0 items-center gap-2 rounded-full border border-line/70 bg-surface/70 px-3.5 py-2 text-muted backdrop-blur-sm transition duration-200 focus-within:border-accent/70 focus-within:bg-surface-2 focus-within:text-fg">
        <SearchIcon className="h-4 w-4 shrink-0" aria-hidden />
        <input
          type="search"
          role="combobox"
          className="w-full min-w-0 bg-transparent text-sm text-fg placeholder-faint outline-none"
          placeholder="Search anime &amp; manga..."
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Search anime and manga"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls="search-suggest-list"
          aria-activedescendant={
            activeKey ? `search-suggest-${activeKey}` : undefined
          }
        />
      </div>

      {showPanel && (
        <div
          id="search-suggest-list"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 origin-top animate-fade-in overflow-hidden rounded-2xl border border-line/60 bg-canvas/95 shadow-lift ring-1 ring-line/40 backdrop-blur-xl"
        >
          {hasResults ? (
            <div className="max-h-[70vh] overflow-y-auto py-1.5">
              {animeResults.length > 0 && (
                <>
                  <p className="px-3 pb-1 pt-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-faint">
                    Anime
                  </p>
                  <ul>
                    {animeResults.map((s) => {
                      const key = `anime-${s.id}`;
                      const isActive = key === activeKey;
                      return (
                        <li key={key} role="presentation">
                          <button
                            id={`search-suggest-${key}`}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onMouseEnter={() =>
                              setActive(flat.findIndex((f) => f.key === key))
                            }
                            onClick={() => go(`/anime/${s.id}`)}
                            className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                              isActive ? 'bg-surface-2' : 'hover:bg-surface/60'
                            }`}
                          >
                            <span
                              className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-surface ring-1 ring-line/40"
                              style={{
                                backgroundColor:
                                  s.coverImage.color || undefined,
                              }}
                            >
                              {s.coverImage.medium && (
                                // eslint-disable-next-line @next/next/no-img-element -- tiny suggestion thumbnail; next/image adds overhead for a transient dropdown
                                <img
                                  src={s.coverImage.medium}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block truncate text-sm font-medium ${
                                  isActive ? 'text-accent' : 'text-fg'
                                }`}
                              >
                                {pickTitle(s.title, lang) || 'Untitled'}
                              </span>
                              {animeLabel(s) && (
                                <span className="mt-0.5 block truncate text-xs text-faint">
                                  {animeLabel(s)}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {mangaResults.length > 0 && (
                <>
                  <p className="px-3 pb-1 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-faint">
                    Manga
                  </p>
                  <ul>
                    {mangaResults.map((m) => {
                      const key = `manga-${m.id}`;
                      const isActive = key === activeKey;
                      return (
                        <li key={key} role="presentation">
                          <button
                            id={`search-suggest-${key}`}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onMouseEnter={() =>
                              setActive(flat.findIndex((f) => f.key === key))
                            }
                            onClick={() => go(`/manga/${m.id}`)}
                            className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                              isActive ? 'bg-surface-2' : 'hover:bg-surface/60'
                            }`}
                          >
                            <span
                              className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-surface ring-1 ring-line/40"
                              style={{
                                backgroundColor:
                                  m.coverImage.color || undefined,
                              }}
                            >
                              {m.coverImage.medium && (
                                // eslint-disable-next-line @next/next/no-img-element -- tiny suggestion thumbnail; next/image adds overhead for a transient dropdown
                                <img
                                  src={m.coverImage.medium}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              )}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span
                                className={`block truncate text-sm font-medium ${
                                  isActive ? 'text-accent' : 'text-fg'
                                }`}
                              >
                                {pickTitle(m.title, lang) || 'Untitled'}
                              </span>
                              {mangaLabel(m) && (
                                <span className="mt-0.5 block truncate text-xs text-faint">
                                  {mangaLabel(m)}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <p className="px-4 py-4 text-sm text-muted">
              {loading ? 'Searching…' : 'No matches yet.'}
            </p>
          )}

          <button
            type="button"
            onClick={submitFull}
            className="flex w-full items-center justify-between gap-2 border-t border-line/50 bg-surface/40 px-4 py-2.5 text-left text-xs font-medium text-muted transition hover:text-fg"
          >
            <span>
              See all results for{' '}
              <span className="text-fg">&ldquo;{trimmed}&rdquo;</span>
            </span>
            <span aria-hidden className="text-faint">
              Enter ↵
            </span>
          </button>
        </div>
      )}
    </div>
  );
};

export default SearchAutosuggest;
