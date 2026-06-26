import type { Provider, WatchParams, ResolveResult, Source } from '../types.js';
import { config } from '../config.js';

// AniLiberty / AniLibria v1 API provider. It is not an AllAnime-scale source,
// and is kept research-only because verified streams are Russian audio, not JP audio.
// but it is a clean structured API with direct HLS playlists per episode.
// API v2/v3 on api.anilibria.tv now returns 410; v1 lives at anilibria.top.
const API_BASE = (process.env.ANILIBERTY_API_BASE || 'https://anilibria.top/api/v1').replace(/\/+$/, '');
const REFERER = process.env.ANILIBERTY_REFERER || 'https://anilibria.top/';

type Maybe<T> = T | null | undefined;

interface ReleaseName {
  main?: Maybe<string>;
  english?: Maybe<string>;
  alternative?: Maybe<string>;
}

interface ReleaseSummary {
  id: number;
  alias?: string;
  name?: ReleaseName;
  episodes_total?: number;
  is_blocked_by_geo?: boolean;
  is_blocked_by_copyrights?: boolean;
}

interface CatalogResponse {
  data?: ReleaseSummary[];
}

interface Episode {
  ordinal?: number;
  sort_order?: number;
  hls_480?: Maybe<string>;
  hls_720?: Maybe<string>;
  hls_1080?: Maybe<string>;
}

interface ReleaseDetail extends ReleaseSummary {
  episodes?: Episode[];
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, {
    headers: { 'User-Agent': config.userAgent, Referer: REFERER },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

function releaseNames(r: ReleaseSummary): string[] {
  return [r.name?.english, r.name?.alternative, r.name?.main, r.alias]
    .filter((v): v is string => Boolean(v));
}

function pickRelease(items: ReleaseSummary[], titles: string[]): ReleaseSummary | null {
  if (!items.length) return null;
  const wanted = titles.map(norm).filter(Boolean);
  const exact = items.find((item) => releaseNames(item).some((name) => wanted.includes(norm(name))));
  if (exact) return exact;
  const contains = items.find((item) => {
    const names = releaseNames(item).map(norm);
    return names.some((name) => wanted.some((w) => name.includes(w) || w.includes(name)));
  });
  if (contains) return contains;
  return [...items].sort((a, b) => (b.episodes_total || 0) - (a.episodes_total || 0))[0];
}

function episodeNumber(ep: Episode): number {
  return Number(ep.ordinal || ep.sort_order || 0);
}

export const aniliberty: Provider = {
  id: 'aniliberty',
  async resolve(params: WatchParams): Promise<ResolveResult | null> {
    // The API is Russian-voice focused, not an English-dub provider. If the UI asks
    // for dub, let another provider handle it rather than serving the wrong language.
    if (params.category === 'dub') return null;

    const query = params.titles.find(Boolean);
    if (!query) return null;

    const searchUrl =
      `${API_BASE}/anime/catalog/releases?limit=8&f[search]=${encodeURIComponent(query)}`;
    const search = await fetchJson<CatalogResponse>(searchUrl);
    const picked = pickRelease(search?.data || [], params.titles);
    if (!picked) return null;

    const detail = await fetchJson<ReleaseDetail>(
      `${API_BASE}/anime/releases/${encodeURIComponent(String(picked.alias || picked.id))}`
    );
    if (!detail || detail.is_blocked_by_geo || detail.is_blocked_by_copyrights) return null;

    const target = (detail.episodes || []).find((ep) => episodeNumber(ep) === params.episode);
    if (!target) return null;

    const sources: Source[] = [];
    if (target.hls_1080) {
      sources.push({ url: target.hls_1080, quality: '1080p', isM3U8: true, headers: { Referer: REFERER } });
    }
    if (target.hls_720) {
      sources.push({ url: target.hls_720, quality: '720p', isM3U8: true, headers: { Referer: REFERER } });
    }
    if (target.hls_480) {
      sources.push({ url: target.hls_480, quality: '480p', isM3U8: true, headers: { Referer: REFERER } });
    }

    if (!sources.length) return null;
    return { provider: 'aniliberty', sources, subtitles: [], headers: { Referer: REFERER } };
  },
};
