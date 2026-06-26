import { HiAnime } from 'aniwatch';
import type { Provider, WatchParams, ResolveResult, Source, Subtitle } from '../types.js';

const REFERER = process.env.HIANIME_REFERER || 'https://megacloud.blog/';
const scraper = new HiAnime.Scraper();

interface SearchAnime {
  id?: string | null;
  name?: string | null;
  jname?: string | null;
  episodes?: { sub?: number | null; dub?: number | null };
}
interface SearchResult {
  animes?: SearchAnime[];
}
interface EpisodeItem {
  episodeId?: string | null;
  number?: number;
}
interface EpisodesResult {
  episodes?: EpisodeItem[];
}
interface HianimeSource {
  url?: string;
  quality?: string;
  isM3U8?: boolean;
}
interface HianimeSubtitle {
  url?: string;
  lang?: string;
}
interface SourcesResult {
  headers?: Record<string, string>;
  sources?: HianimeSource[];
  subtitles?: HianimeSubtitle[];
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function pickAnime(items: SearchAnime[], titles: string[]): SearchAnime | null {
  if (!items.length) return null;
  const wanted = titles.map(norm).filter(Boolean);
  const exact = items.find((item) => [item.name, item.jname].some((name) => name && wanted.includes(norm(name))));
  if (exact) return exact;
  return [...items].sort(
    (a, b) => ((b.episodes?.sub || 0) + (b.episodes?.dub || 0)) - ((a.episodes?.sub || 0) + (a.episodes?.dub || 0))
  )[0];
}

function langCode(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('english')) return 'en';
  if (l.includes('indonesian') || l.includes('bahasa')) return 'id';
  if (l.includes('japanese')) return 'ja';
  if (l.includes('spanish')) return 'es';
  if (l.includes('portuguese')) return 'pt';
  if (l.includes('arabic')) return 'ar';
  if (l.includes('french')) return 'fr';
  if (l.includes('german')) return 'de';
  return l.slice(0, 2) || 'en';
}

function toSubtitles(items: HianimeSubtitle[] | undefined): Subtitle[] {
  const seen = new Set<string>();
  const out: Subtitle[] = [];
  for (const item of items || []) {
    if (!item.url || !item.lang || /thumbnail/i.test(item.lang) || seen.has(item.url)) continue;
    seen.add(item.url);
    out.push({ url: item.url, lang: langCode(item.lang), label: item.lang });
  }
  return out;
}

export const hianime: Provider = {
  id: 'hianime',
  async resolve(params: WatchParams): Promise<ResolveResult | null> {
    const query = params.titles.find(Boolean);
    if (!query) return null;

    const search = (await scraper.search(query)) as SearchResult;
    const anime = pickAnime(search.animes || [], params.titles);
    if (!anime?.id) return null;

    const epData = (await scraper.getEpisodes(anime.id)) as EpisodesResult;
    const episode = (epData.episodes || []).find((ep) => Number(ep.number) === params.episode);
    if (!episode?.episodeId) return null;

    const result = (await scraper.getEpisodeSources(
      episode.episodeId,
      'hd-1',
      params.category
    )) as SourcesResult;

    const headers = result.headers || { Referer: REFERER };
    const sources: Source[] = (result.sources || [])
      .filter((s) => Boolean(s.url))
      .map((s) => ({
        url: s.url!,
        quality: s.quality || 'auto',
        isM3U8: s.isM3U8 !== false,
        headers,
      }));

    if (!sources.length) return null;
    return { provider: 'hianime', sources, subtitles: toSubtitles(result.subtitles), headers };
  },
};