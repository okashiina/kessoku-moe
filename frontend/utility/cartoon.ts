import { cached } from './ssrCache';

const API = 'https://api.tvmaze.com';

async function timedFetch(
  url: string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export interface CartoonShow {
  id: number;
  name: string;
  type: string | null;
  language: string | null;
  status?: string;
  weight?: number;
  genres: string[];
  premiered: string | null;
  summary: string | null;
  image: { medium: string; original: string } | null;
  url: string;
  rating: { average: number | null };
  network: { name: string } | null;
  webChannel: { name: string } | null;
  officialSite: string | null;
  externals: { imdb: string | null };
}

export interface CartoonEpisode {
  id: number;
  name: string;
  season: number;
  number: number | null;
  airdate: string | null;
  summary: string | null;
}

export interface CartoonSuggestion {
  id: number;
  name: string;
  cover: string | null;
  year: string | null;
}

async function tvmaze<T>(path: string): Promise<T> {
  const response = await timedFetch(`${API}${path}`, {
    headers: { 'User-Agent': 'kessoku-moe/1.0 (cartoon catalog)' },
  });
  if (!response.ok) throw new Error(`TVMaze ${response.status}`);
  return response.json() as Promise<T>;
}

export async function searchCartoons(query: string): Promise<CartoonShow[]> {
  const term = query.trim().slice(0, 80);
  if (!term) return [];
  return cached(
    `cartoon:search:${term.toLowerCase()}`,
    60 * 60 * 1000,
    async () => {
      const results = await tvmaze<Array<{ show: CartoonShow }>>(
        `/search/shows?q=${encodeURIComponent(term)}`
      );
      return results
        .map(({ show }) => show)
        .filter(
          (show) => show.type === 'Animation' && show.language === 'English'
        );
    }
  );
}

const INDEX_PAGES_PER_VIEW = 3;

async function getShowIndexPage(page: number): Promise<CartoonShow[]> {
  return cached(`cartoon:index:${page}`, 24 * 60 * 60 * 1000, async () => {
    const response = await timedFetch(`${API}/shows?page=${page}`);
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`TVMaze ${response.status}`);
    return response.json() as Promise<CartoonShow[]>;
  });
}

export async function getCartoonCatalogPage(page: number): Promise<{
  shows: CartoonShow[];
  hasMore: boolean;
}> {
  const firstIndexPage = page * INDEX_PAGES_PER_VIEW;
  const results = await Promise.allSettled(
    Array.from({ length: INDEX_PAGES_PER_VIEW }, (_, index) =>
      getShowIndexPage(firstIndexPage + index)
    )
  );
  if (results.every((result) => result.status === 'rejected')) {
    throw new Error('Cartoon catalog unavailable');
  }
  const batches = results.map((result) =>
    result.status === 'fulfilled' ? result.value : []
  );
  const shows = batches
    .flat()
    .filter(
      (show) =>
        show.type === 'Animation' &&
        show.language === 'English' &&
        Boolean(show.image?.medium)
    )
    .sort((left, right) =>
      left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
    );
  return {
    shows,
    hasMore:
      results[results.length - 1].status === 'rejected' ||
      batches[batches.length - 1].length > 0,
  };
}

export async function getCartoon(id: number): Promise<CartoonShow> {
  return cached(`cartoon:show:${id}`, 60 * 60 * 1000, () =>
    tvmaze<CartoonShow>(`/shows/${id}`)
  );
}

export async function getCartoonEpisodes(
  id: number
): Promise<CartoonEpisode[]> {
  return cached(`cartoon:episodes:${id}`, 60 * 60 * 1000, () =>
    tvmaze<CartoonEpisode[]>(`/shows/${id}/episodes`)
  );
}
