import { useState } from 'react';

import Card from '@components/anime/Card';

import type {
  AnimeVibeFilters,
  AnimeVibeMedia,
} from '../../pages/api/anime/vibe-search';

const SORT_LABEL: Record<string, string> = {
  TRENDING_DESC: 'trending',
  POPULARITY_DESC: 'popular',
  SCORE_DESC: 'top rated',
  START_DATE_DESC: 'newest',
};

const STATUS_LABEL: Record<string, string> = {
  RELEASING: 'airing',
  FINISHED: 'finished',
  NOT_YET_RELEASED: 'upcoming',
};

const describeFilters = (filters: AnimeVibeFilters): string => {
  const parts = [...filters.genres];
  if (filters.format) parts.push(filters.format);
  if (filters.status)
    parts.push(STATUS_LABEL[filters.status] ?? filters.status);
  parts.push(SORT_LABEL[filters.sort] ?? 'popular');
  if (filters.search) parts.unshift(`"${filters.search}"`);
  if (filters.titles?.length) parts.unshift('best matches');
  return parts.filter(Boolean).join(' / ');
};

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'limited'; daily: boolean }
  | { kind: 'error' }
  | {
      kind: 'done';
      media: AnimeVibeMedia[];
      filters: AnimeVibeFilters;
      query: string;
    };

const VibeSearch: React.FC = () => {
  const [input, setInput] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const query = input.trim();
    if (!query || state.kind === 'loading') return;
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/anime/vibe-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      if (res.status === 429) {
        let daily = false;
        try {
          const data = (await res.json()) as { reason?: string };
          daily = data?.reason === 'daily';
        } catch {
          /* ignore */
        }
        setState({ kind: 'limited', daily });
        return;
      }
      if (!res.ok) {
        setState({ kind: 'error' });
        return;
      }
      const data = (await res.json()) as {
        media?: AnimeVibeMedia[];
        filters?: AnimeVibeFilters;
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
    <section className="space-y-3">
      <form onSubmit={submit} className="flex max-w-xl gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={300}
          placeholder="Describe the vibe... e.g. noisy band comedy after school"
          aria-label="Describe the anime vibe you want to watch"
          enterKeyHint="search"
          className="min-w-0 flex-1 rounded-xl border border-line/70 bg-surface/60 px-4 py-2 text-base text-fg outline-none transition [touch-action:manipulation] placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={state.kind === 'loading' || !input.trim()}
          className="min-h-[44px] shrink-0 rounded-xl bg-aurora px-4 py-2 text-sm font-semibold text-accent-ink shadow-glow transition [touch-action:manipulation] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.kind === 'loading' ? 'Tuning...' : 'Vibe search'}
        </button>
      </form>

      {state.kind === 'loading' && (
        <p className="text-sm text-muted motion-safe:animate-pulse">
          Finding anime that match the mood...
        </p>
      )}

      {state.kind === 'limited' && (
        <p className="text-sm text-muted">
          {state.daily
            ? "That's the free vibe-search quota for today. Catch you tomorrow."
            : 'Slow down a sec. Try another vibe in a moment.'}
        </p>
      )}

      {state.kind === 'error' && (
        <p className="text-sm text-muted">
          That did not work. Try describing the vibe a little differently.
        </p>
      )}

      {state.kind === 'done' && (
        <div className="pt-3">
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
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] justify-items-center gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
              {state.media.map((anime) => (
                <Card key={anime.id} anime={anime as never} />
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
