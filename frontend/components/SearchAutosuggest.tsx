import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/router';

import { SearchIcon } from '@heroicons/react/outline';

import useSearchSuggest, { Suggestion } from '@hooks/useSearchSuggest';
import { pickTitle, useTitleLang } from '@utility/titleLang';

const formatLabel = (s: Suggestion): string => {
  const parts = [s.format, s.seasonYear ? String(s.seasonYear) : null].filter(
    Boolean
  );
  return parts.join(' · ');
};

const SearchAutosuggest: React.FC = () => {
  const router = useRouter();
  const lang = useTitleLang();
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { results, loading } = useSearchSuggest(term);
  const trimmed = term.trim();
  const showPanel = open && trimmed.length >= 2;

  // Reset the keyboard highlight whenever the result set changes.
  useEffect(() => setActive(-1), [results]);

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
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      if (active >= 0 && results[active]) go(`/anime/${results[active].id}`);
      else submitFull();
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div ref={wrapRef} className="relative ml-auto w-full max-w-xs sm:max-w-sm">
      <div className="flex items-center gap-2 rounded-full border border-line/70 bg-surface/70 px-3.5 py-2 text-muted backdrop-blur-sm transition duration-200 focus-within:border-accent/70 focus-within:bg-surface-2 focus-within:text-fg">
        <SearchIcon className="h-4 w-4 shrink-0" aria-hidden />
        <input
          type="search"
          role="combobox"
          className="w-full bg-transparent text-sm text-fg placeholder-faint outline-none"
          placeholder="Search anime..."
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label="Search anime"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          aria-controls="search-suggest-list"
          aria-activedescendant={
            active >= 0 ? `search-suggest-${results[active]?.id}` : undefined
          }
        />
      </div>

      {showPanel && (
        <div
          id="search-suggest-list"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-2 origin-top animate-fade-in overflow-hidden rounded-2xl border border-line/60 bg-canvas/95 shadow-lift ring-1 ring-line/40 backdrop-blur-xl"
        >
          {results.length > 0 ? (
            <ul className="max-h-[70vh] overflow-y-auto py-1.5">
              {results.map((s, i) => {
                const isActive = i === active;
                return (
                  <li key={s.id} role="presentation">
                    <button
                      id={`search-suggest-${s.id}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(`/anime/${s.id}`)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                        isActive ? 'bg-surface-2' : 'hover:bg-surface/60'
                      }`}
                    >
                      <span
                        className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-surface ring-1 ring-line/40"
                        style={{
                          backgroundColor: s.coverImage.color || undefined,
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
                        {formatLabel(s) && (
                          <span className="mt-0.5 block truncate text-xs text-faint">
                            {formatLabel(s)}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
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
