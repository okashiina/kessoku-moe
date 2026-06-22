import { useState, useSyncExternalStore } from 'react';

import MangaCard from '@components/manga/Card';
import type { MangaInfo } from '@utility/manga';
import { getNsfwClient, subscribeNsfw } from '@utility/nsfw';

import type { VibeFilters } from '../../pages/api/manga/vibe-search';

// AI vibe-search box: the reader describes a mood in plain words and we POST it
// to /api/manga/vibe-search, which turns it into whitelisted AniList filters and
// returns matching titles. Results render below as their own section so the
// page's normal rails/grid stay intact. Handles loading, 429, and empty states.

const SORT_LABEL: Record<string, string> = {
  TRENDING_DESC: 'trending',
  POPULARITY_DESC: 'popular',
  SCORE_DESC: 'top rated',
};
const COUNTRY_LABEL: Record<string, string> = {
  JP: 'manga',
  KR: 'manhwa',
  CN: 'manhua',
};
const STATUS_LABEL: Record<string, string> = {
  RELEASING: 'ongoing',
  FINISHED: 'completed',
};

// "Action · Romance · trending · ongoing" — a human echo of what we searched.
const describeFilters = (f: VibeFilters): string => {
  const parts = [...f.genres];
  if (f.countryOfOrigin) parts.push(COUNTRY_LABEL[f.countryOfOrigin]);
  if (f.status) parts.push(STATUS_LABEL[f.status]);
  parts.push(SORT_LABEL[f.sort] ?? 'popular');
  if (f.search) parts.unshift(`“${f.search}”`);
  return parts.filter(Boolean).join(' · ');
};

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'limited' }
  | { kind: 'error' }
  | { kind: 'done'; media: MangaInfo[]; filters: VibeFilters; query: string };

const VibeSearch: React.FC = () => {
  const nsfw = useSyncExternalStore(subscribeNsfw, getNsfwClient, () => false);
  const [input, setInput] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const query = input.trim();
    if (!query || state.kind === 'loading') return;
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/manga/vibe-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, nsfw }),
      });
      if (res.status === 429) {
        setState({ kind: 'limited' });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error' });
        return;
      }
      const data = (await res.json()) as {
        media?: MangaInfo[];
        filters?: VibeFilters;
      };
      setState({
        kind: 'done',
        media: Array.isArray(data.media) ? data.media : [],
        filters: data.filters ?? { genres: [], sort: 'POPULARITY_DESC' },
        query,
      });
    } catch {
      setState({ kind: 'error' });
    }
  };

  return (
    <section className="mt-2">
      <form onSubmit={submit} className="flex max-w-xl gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={300}
          placeholder="Describe the vibe… e.g. cozy romance with a slow burn"
          aria-label="Describe the vibe you want to read"
          enterKeyHint="search"
          className="min-w-0 flex-1 rounded-xl border border-line/70 bg-surface/60 px-4 py-2 text-base text-fg outline-none transition [touch-action:manipulation] placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={state.kind === 'loading' || !input.trim()}
          className="shrink-0 rounded-xl bg-aurora px-4 py-2 text-sm font-semibold text-accent-ink shadow-glow transition [touch-action:manipulation] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.kind === 'loading' ? 'Reading…' : 'Vibe search'}
        </button>
      </form>

      {state.kind === 'loading' && (
        <p className="mt-3 text-sm text-muted motion-safe:animate-pulse">
          Finding manga that match the mood…
        </p>
      )}

      {state.kind === 'limited' && (
        <p className="mt-3 text-sm text-muted">
          Slow down a sec — too many vibe searches at once. Try again in a
          moment.
        </p>
      )}

      {state.kind === 'error' && (
        <p className="mt-3 text-sm text-muted">
          That didn&rsquo;t work. Try describing the vibe a little differently.
        </p>
      )}

      {state.kind === 'done' && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
              Vibe results
            </h2>
            {state.media.length > 0 && (
              <span className="text-sm text-muted">
                showing: {describeFilters(state.filters)}
              </span>
            )}
          </div>

          {state.media.length > 0 ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] justify-items-center gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
              {state.media.map((manga) => (
                <MangaCard key={manga.id} manga={manga} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              Nothing matched that vibe. Try another mood.
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default VibeSearch;
