import useSWR from 'swr';

import { getToken } from '@utility/anilistAuth';

// Per-episode community ratings for one anime. One batch fetch (SWR dedupes it
// across components by key), exposing the community aggregate per episode plus
// the signed-in viewer's own scores, and rate/clear writers that revalidate.
// Reads are public; writing requires an AniList login (enforced server-side).

export interface EpAggregate {
  avg: number; // 0-100 scale (the show-rating scoreRaw scale)
  count: number;
}

interface RatingsData {
  aggregates: Record<number, EpAggregate>;
  mine: Record<number, number>;
}

const fetcher = async (url: string): Promise<RatingsData> => {
  const token = getToken();
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<RatingsData>;
};

export interface UseEpisodeRatings {
  aggregates: Record<number, EpAggregate>;
  mine: Record<number, number>;
  rate: (episode: number, score: number) => Promise<boolean>;
  clear: (episode: number) => Promise<boolean>;
  loading: boolean;
  unavailable: boolean; // DB/feature not configured (503)
}

export const useEpisodeRatings = (
  animeId: number | null | undefined
): UseEpisodeRatings => {
  const key =
    animeId && animeId > 0 ? `/api/anime/${animeId}/episode-ratings` : null;
  const { data, error, mutate } = useSWR<RatingsData>(key, fetcher, {
    revalidateOnFocus: false,
  });

  const write = async (
    method: 'PUT' | 'DELETE',
    episode: number,
    score?: number
  ): Promise<boolean> => {
    if (!animeId) return false;
    const token = getToken();
    const res = await fetch('/api/episodes/rating', {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        anilistId: animeId,
        episode,
        ...(score !== undefined ? { score } : {}),
      }),
    });
    if (!res.ok) return false;
    await mutate();
    return true;
  };

  return {
    aggregates: data?.aggregates ?? {},
    mine: data?.mine ?? {},
    rate: (episode, score) => write('PUT', episode, score),
    clear: (episode) => write('DELETE', episode),
    loading: !data && !error,
    unavailable: Boolean(error && error.message === '503'),
  };
};
