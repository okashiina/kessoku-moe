import type { Provider, WatchParams, ResolveResult, Source, Subtitle } from '../types.js';
import { config } from '../config.js';

// HiAnime provider, now backed by hianime.at (the HiAnime-theme site that ani-cli
// v5.1 switched to in 2026-09) instead of the dead hianime.to / `aniwatch` scraper.
// Validated live 2026-11-15 (see docs/PROVIDER-SHORTLIST-2026-11.md):
//   GET /search?keyword=<title>                      -> show slug "<name>-<id>"
//   GET /api/theme/episode/list/<id>                 -> {html}: ep-item data-number/data-id
//   GET /api/theme/episode/servers?episodeId=<epId>  -> {html}: server-item per sub/dub,
//       data-hash = base64(embed url) on the ZokoAnime server
//   GET <embed>  -> window.__P = base64(JSON XOR "otaku-embed-v1")
//       -> { src: master.m3u8, subtitles: [{lang,label,default,src}], skip, ... }
//
// WHY: same shape as KAA. Clean video (no burned-in subs), multi-language soft VTT
// (incl. Indonesian on many titles), sub + dub, 1080p, and new episodes show up the
// day they air. The stream CDN only wants Referer = the embed origin, which the /hls
// and /track proxies inject from the source headers. No Cloudflare gate today.

const API = (process.env.HIANIME_API || 'https://hianime.at').replace(/\/+$/, '');
const XOR_KEY = Buffer.from(process.env.HIANIME_EMBED_KEY || 'otaku-embed-v1');
const TIMEOUT_MS = 15000;

const dbg = (...a: unknown[]): void => {
  // eslint-disable-next-line no-console
  if (process.env.HIANIME_DEBUG) console.warn('[hianime]', ...a);
};

async function getText(url: string, referer = `${API}/`): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': config.userAgent,
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: referer,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  // Surface a challenge as "cloudflare" so the resolver opens the breaker at once.
  if (/<title>\s*Just a moment/i.test(text)) throw new Error(`cloudflare challenge: ${url}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return text;
}

// The theme API answers {status, html}; take the html fragment.
async function getFragment(url: string): Promise<string> {
  const text = await getText(url);
  try {
    const j = JSON.parse(text) as { html?: unknown };
    return typeof j.html === 'string' ? j.html : '';
  } catch {
    return '';
  }
}

const attr = (tag: string, name: string): string | null =>
  tag.match(new RegExp(`${name}="([^"]*)"`, 'i'))?.[1] ?? null;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const ENTITIES: Record<string, string> = {
  '&#039;': "'",
  '&#39;': "'",
  '&quot;': '"',
  '&lt;': '<',
  '&gt;': '>',
};
function decodeEntities(s: string): string {
  let out = s;
  for (const [ent, ch] of Object.entries(ENTITIES)) out = out.split(ent).join(ch);
  return out.split('&amp;').join('&');
}

interface SearchHit {
  slug: string;
  title: string;
}

async function search(query: string): Promise<SearchHit[]> {
  const html = await getText(`${API}/search?keyword=${encodeURIComponent(query)}`);
  // The "top 10" sidebar repeats the result markup; only read the main column.
  const main = html.split('id="main-sidebar"')[0];
  return [
    ...main.matchAll(/class="film-name">\s*<a href="[^"]*\/([^"/?]+)"[^>]*title="([^"]*)"/g),
  ].map((m) => ({ slug: m[1], title: decodeEntities(m[2]) }));
}

async function findShow(titles: string[]): Promise<SearchHit | null> {
  const wanted = titles.map(norm).filter(Boolean);
  let fallback: SearchHit | null = null;
  // Try each candidate title (english, then romaji) until one matches exactly.
  for (const query of [...new Set(titles.filter(Boolean))]) {
    const hits = await search(query);
    const exact = hits.find((h) => wanted.includes(norm(h.title)));
    if (exact) return exact;
    fallback = fallback || hits[0] || null;
  }
  return fallback;
}

interface EmbedSubtitle {
  lang?: string;
  label?: string;
  default?: boolean;
  src?: string;
}
interface EmbedConfig {
  src?: string;
  subtitles?: EmbedSubtitle[];
}

// window.__P is base64(JSON XOR "otaku-embed-v1"), cycling the key byte-by-byte.
function deobfuscate(b64: string): EmbedConfig {
  const bytes = Buffer.from(b64, 'base64');
  for (let i = 0; i < bytes.length; i += 1) bytes[i] ^= XOR_KEY[i % XOR_KEY.length];
  return JSON.parse(bytes.toString('utf8')) as EmbedConfig;
}

function toSubtitles(items: EmbedSubtitle[] | undefined): Subtitle[] {
  const seen = new Set<string>();
  const out: Subtitle[] = [];
  // Default track first so the player picks it when several share a language.
  const sorted = [...(items || [])].sort((a, b) => Number(Boolean(b.default)) - Number(Boolean(a.default)));
  for (const s of sorted) {
    if (!s.src || seen.has(s.src) || /thumbnail|sprite/i.test(s.label || '')) continue;
    seen.add(s.src);
    const lang = (s.lang || 'en').toLowerCase().split(/[-_]/)[0];
    out.push({ url: s.src, lang, label: s.label || lang });
  }
  return out;
}

export const hianime: Provider = {
  id: 'hianime',
  async resolve(params: WatchParams): Promise<ResolveResult | null> {
    if (!params.titles.some(Boolean)) return null;

    // 1) Search.
    const show = await findShow(params.titles);
    if (!show) return null;
    const animeId = show.slug.split('-').pop();
    dbg('show', show.slug, show.title);

    // 2) Episode id for the wanted number.
    const list = await getFragment(`${API}/api/theme/episode/list/${animeId}`);
    const epTag = [...list.matchAll(/<a[^>]*ep-item[^>]*>/g)]
      .map((m) => m[0])
      .find((t) => Number(attr(t, 'data-number')) === params.episode);
    const epId = epTag ? attr(epTag, 'data-id') : null;
    if (!epId) {
      dbg('episode not found', params.episode);
      return null;
    }

    // 3) Servers -> the ZokoAnime embed for sub/dub (the only one we can decode).
    const servers = await getFragment(`${API}/api/theme/episode/servers?episodeId=${epId}`);
    const serverTag = [...servers.matchAll(/<[^>]*server-item[^>]*>/g)]
      .map((m) => m[0])
      .find(
        (t) =>
          attr(t, 'data-type') === params.category &&
          /zoko/i.test(attr(t, 'data-server-name') || '') &&
          attr(t, 'data-hash')
      );
    if (!serverTag) {
      dbg('no ZokoAnime server for', params.category);
      return null;
    }
    const embed = Buffer.from(attr(serverTag, 'data-hash') || '', 'base64').toString('utf8');
    let embedOrigin: string;
    try {
      embedOrigin = new URL(embed).origin;
    } catch {
      throw new Error(`hianime: bad embed url from server hash`);
    }

    // 4) Embed config -> master HLS + soft subtitles.
    const page = await getText(embed, `${API}/`);
    const blob = page.match(/window\.__P="([^"]*)"/)?.[1];
    if (!blob) throw new Error('hianime: embed config (window.__P) not found');
    let cfg: EmbedConfig;
    try {
      cfg = deobfuscate(blob);
    } catch {
      throw new Error('hianime: embed config did not decode (XOR key rotated?)');
    }
    if (!cfg.src) return null;

    const headers = { Referer: `${embedOrigin}/` };
    const sources: Source[] = [{ url: cfg.src, quality: 'auto', isM3U8: true, headers }];
    const subtitles = toSubtitles(cfg.subtitles);
    dbg('src', new URL(cfg.src).host, 'subs', subtitles.length);

    return { provider: 'hianime', sources, subtitles, headers };
  },
};
