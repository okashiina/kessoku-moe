import type {
  Provider,
  WatchParams,
  ResolveResult,
  Source,
  Subtitle,
} from '../types.js';
import { config } from '../config.js';

// KickAssAnime (KAA) provider. Current host kaa.lt (was kickass-anime.ro/.ru / kaa.mx).
// Validated live 2026-06-26 (see docs/SOURCE-RESEARCH-CONTINUATION-2026-06-25.md):
//   FlareSolverr mints a cf_clearance for kaa.lt ONCE (cached, sliding) ->
//   POST /api/fsearch {query}            -> find the show (slug + locales)
//   GET  /api/show/<slug>/episodes?lang= -> the episode's slug for ja-JP (sub) / en-US (dub)
//   GET  /api/show/<slug>/episode/ep-<n>-<slug> -> the `servers` list
//   pick the cat-player "vidstream" server -> the master HLS is derived DIRECTLY from
//   the server's `id` query param (NO decryption, unlike the legacy vidstreaming
//   server): https://hls.krussdomi.com/manifest/<id>/master.m3u8 — a multi-audio HLS
//   where Japanese is DEFAULT. Soft subtitles (.vtt) come from the player page's inline
//   `props` JSON (best-effort; our own subdl/Jimaku tracks fill in regardless).
//
// WHY KAA: clean/RAW video (JP audio, NO burned-in subs) + soft VTT subs — the ideal
// for our own-caption player. The krussdomi CDN is NOT Cloudflare-gated; it only needs
// Origin/Referer: https://krussdomi.com, which our /hls + /track proxies inject from
// the source's Referer header. Reachable from an Indonesian residential IP.

const API = process.env.KAA_API || 'https://kaa.lt';
const X_ORIGIN = 'kaa.lt';
const CDN_REFERER = 'https://krussdomi.com/';
const MANIFEST_BASE = 'https://hls.krussdomi.com/manifest';
const UA = config.userAgent;

const dbg = (...a: unknown[]): void => {
  // eslint-disable-next-line no-console
  if (process.env.KAA_DEBUG) console.warn('[kaa]', ...a);
};

// ---- FlareSolverr: mint cf_clearance for kaa.lt once (cached), then fetch the API. ----
interface Clearance {
  cookie: string;
  ua: string;
}
interface FsSolution {
  status: number;
  cookies: { name: string; value: string }[];
  userAgent: string;
}
interface FsResp {
  status: string;
  message?: string;
  solution?: FsSolution;
}

async function fsSolve(url: string): Promise<Clearance> {
  const res = await fetch(config.flaresolverrUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: 60000 }),
  });
  const j = (await res.json()) as FsResp;
  if (j.status !== 'ok' || !j.solution) {
    throw new Error(`flaresolverr request.get: ${j.message || j.status}`);
  }
  const cookie = (j.solution.cookies || [])
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
  return { cookie, ua: j.solution.userAgent || UA };
}

const CLEARANCE_TTL_MS =
  Number(process.env.KAA_CLEARANCE_TTL_MS) || 45 * 60 * 1000;
let clearanceCache: { clr: Clearance; at: number } | null = null;
async function getClearance(force = false): Promise<Clearance> {
  const now = Date.now();
  if (!force && clearanceCache && now - clearanceCache.at < CLEARANCE_TTL_MS) {
    clearanceCache.at = now; // sliding: keep alive while actively used
    return clearanceCache.clr;
  }
  const clr = await fsSolve(`${API}/`);
  clearanceCache = { clr, at: now };
  return clr;
}

interface ApiInit {
  method?: string;
  body?: unknown;
}
async function apiCall(
  path: string,
  clr: Clearance,
  init?: ApiInit
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${API}${path}`, {
    method: init?.method || 'GET',
    headers: {
      'User-Agent': clr.ua,
      'x-origin': X_ORIGIN,
      Referer: `${API}/`,
      Cookie: clr.cookie,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
  return { status: res.status, text: await res.text() };
}

// Re-solve the clearance once if a call comes back Cloudflare-blocked (403/503 or
// a challenge HTML body instead of JSON), then retry — mirrors the AllAnime path.
async function apiJson<T>(
  path: string,
  init?: ApiInit
): Promise<T | null> {
  let clr = await getClearance();
  let r = await apiCall(path, clr, init);
  const blocked = (res: { status: number; text: string }): boolean =>
    res.status === 403 || res.status === 503 || res.text.trimStart().startsWith('<');
  if (blocked(r)) {
    clr = await getClearance(true);
    r = await apiCall(path, clr, init);
  }
  try {
    return JSON.parse(r.text) as T;
  } catch {
    return null;
  }
}

// ---- API shapes ----
interface SearchItem {
  slug: string;
  title?: string;
  title_en?: string;
  locales?: string[];
  episode_count?: number;
}
interface EpisodeItem {
  slug: string;
  episode_number?: number;
}
interface ServerItem {
  name?: string;
  shortName?: string;
  src?: string;
}

const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function pickShow(
  items: SearchItem[],
  titles: string[],
  locale: string
): SearchItem | null {
  // Prefer shows that actually carry the wanted audio locale (ja-JP / en-US).
  const withLocale = items.filter((i) => (i.locales || []).includes(locale));
  const pool = withLocale.length ? withLocale : items;
  if (!pool.length) return null;
  const wanted = titles.map(norm).filter(Boolean);
  const exact = pool.find((i) =>
    [i.title, i.title_en].some((t) => t && wanted.includes(norm(t)))
  );
  if (exact) return exact;
  return [...pool].sort(
    (a, b) => (b.episode_count || 0) - (a.episode_count || 0)
  )[0];
}

function langCode(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('indonesia')) return 'id';
  if (l.includes('english')) return 'en';
  if (l.includes('japanese') || l.includes('日本')) return 'ja';
  if (l.includes('spanish') || l.includes('español') || l.includes('castellano'))
    return 'es';
  if (l.includes('portug')) return 'pt';
  if (l.includes('german') || l.includes('deutsch')) return 'de';
  if (l.includes('french') || l.includes('franç')) return 'fr';
  if (l.includes('italian')) return 'it';
  if (l.includes('russian') || l.includes('русск')) return 'ru';
  if (l.includes('korean') || l.includes('한국')) return 'ko';
  if (l.includes('chinese') || l.includes('mandarin') || l.includes('中文'))
    return 'zh';
  if (l.includes('arab')) return 'ar';
  if (l.includes('thai') || l.includes('ไทย')) return 'th';
  if (l.includes('viet') || l.includes('việt')) return 'vi';
  if (l.includes('dutch')) return 'nl';
  if (l.includes('polish')) return 'pl';
  if (l.includes('turkish')) return 'tr';
  // Unknown language: the English name's first two letters are usually (not always)
  // the ISO code; better than dropping the track. Known wrong cases are mapped above.
  return l.slice(0, 2) || 'en';
}

// The player `props` JSON is a serialized framework payload where many values are
// wrapped as [tag, value] (e.g. ["English"] sits inside [0, "English"]). Unwrap a
// [number, x] pair to x; pass anything else through.
function unwrap(v: unknown): unknown {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number'
    ? v[1]
    : v;
}

const ENTITIES: Record<string, string> = {
  '&quot;': '"',
  '&#34;': '"',
  '&#39;': "'",
  '&#x27;': "'",
  '&#x2F;': '/',
  '&#47;': '/',
  '&#x3D;': '=',
  '&#x60;': '`',
  '&lt;': '<',
  '&gt;': '>',
};
function decodeEntities(s: string): string {
  let out = s;
  for (const [ent, ch] of Object.entries(ENTITIES)) out = out.split(ent).join(ch);
  return out.split('&amp;').join('&'); // ampersand last
}

function extractSubtitles(propsJson: unknown): Subtitle[] {
  if (!propsJson || typeof propsJson !== 'object') return [];
  const list = unwrap((propsJson as Record<string, unknown>).subtitles);
  if (!Array.isArray(list)) return [];
  const out: Subtitle[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const sub = unwrap(entry);
    if (!sub || typeof sub !== 'object') continue;
    const rec = sub as Record<string, unknown>;
    const src = unwrap(rec.src);
    const name = unwrap(rec.name);
    if (typeof src !== 'string' || !src.includes('.vtt') || seen.has(src)) {
      continue;
    }
    seen.add(src);
    const label = typeof name === 'string' && name ? name : 'Subtitles';
    out.push({ url: src, lang: langCode(label), label });
  }
  return out;
}

// Best-effort soft-sub fetch: read the player page and pull the inline `props` JSON.
// We never execute the page (plain fetch + regex, no disk write), so the page's
// ad/redirect scripts can't run. On any failure we return [] — playback still works
// (Path A m3u8) and our own subdl/Jimaku tracks are attached by the server anyway.
async function fetchSubtitles(playerSrc: string, ua: string): Promise<Subtitle[]> {
  try {
    const res = await fetch(playerSrc, {
      headers: { 'User-Agent': ua, Referer: `${API}/`, Accept: 'text/html' },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const m = html.match(/props="([^"]+)"/);
    if (!m) return [];
    const json: unknown = JSON.parse(decodeEntities(m[1]));
    return extractSubtitles(json);
  } catch {
    return [];
  }
}

export const kaa: Provider = {
  id: 'kaa',
  async resolve(params: WatchParams): Promise<ResolveResult | null> {
    const query = params.titles.find(Boolean);
    if (!query) return null;
    const locale = params.category === 'dub' ? 'en-US' : 'ja-JP';

    // 1) Search.
    const search = await apiJson<{ result?: SearchItem[] }>('/api/fsearch', {
      method: 'POST',
      body: { query },
    });
    const show = pickShow(search?.result || [], params.titles, locale);
    if (!show) return null;
    dbg('show', show.slug, show.title, show.locales);

    // 2) Episode slug for the wanted audio locale.
    const eps = await apiJson<{ result?: EpisodeItem[] }>(
      `/api/show/${show.slug}/episodes?ep=${params.episode}&lang=${locale}`
    );
    const ep = (eps?.result || []).find(
      (e) => Number(e.episode_number) === params.episode
    );
    if (!ep?.slug) {
      dbg('episode not found', params.episode);
      return null;
    }

    // 3) Episode detail -> servers.
    const epId = `ep-${ep.episode_number}-${ep.slug}`;
    const detail = await apiJson<{ servers?: ServerItem[] }>(
      `/api/show/${show.slug}/episode/${epId}`
    );
    const servers = detail?.servers || [];
    const server =
      servers.find(
        (s) => s.src && /cat-player/.test(s.src) && /source=vidstream/.test(s.src)
      ) || servers.find((s) => s.src && /cat-player/.test(s.src));
    if (!server?.src) {
      dbg('no cat-player server', servers.map((s) => s.name));
      return null;
    }

    let id: string | null = null;
    try {
      id = new URL(server.src).searchParams.get('id');
    } catch {
      id = null;
    }
    if (!id) return null;

    // 4) Path A: the master HLS is derived directly from the id (multi-audio, JP
    //    default). Path B: best-effort soft VTT subtitles from the player page.
    const headers = { Referer: CDN_REFERER };
    const sources: Source[] = [
      {
        url: `${MANIFEST_BASE}/${id}/master.m3u8`,
        quality: 'auto',
        isM3U8: true,
        headers,
      },
    ];
    const subtitles = await fetchSubtitles(
      server.src,
      clearanceCache?.clr.ua || UA
    );
    dbg('id', id, 'subs', subtitles.length);

    return { provider: 'kaa', sources, subtitles, headers };
  },
};
