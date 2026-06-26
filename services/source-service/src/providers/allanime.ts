import { createHash, createDecipheriv } from 'node:crypto';
import type { Provider, WatchParams, ResolveResult, Source, Subtitle } from '../types.js';
import { config } from '../config.js';

// AllAnime provider. Pipeline (see docs/ALLANIME-PROVIDER.md §0):
//   FlareSolverr mints a cf_clearance cookie + matching UA for the Cloudflare-gated
//   API ONCE (cached per host ~20 min — the browser solve is the slow part, but the
//   cookie is reusable over plain fetches) -> GET the GraphQL API with that cookie
//   (search -> episode via persisted-query hash) -> AES-256-CTR-decrypt the episode
//   `tobeparsed` payload -> decode each obfuscated sourceUrl ("-"-prefixed hex, XOR 56)
//   -> PREFER AllAnime's own direct CDN link (fast4speed / wixmp / .mp4 / .m3u8); only
//   fall back to the slower /clock.json embeds when there's no direct link.
//
// WHY AllAnime: extra catalogue coverage, fresher airing, and dub. (Hardsub in
// practice — the raw/soft-sub ecosystem collapsed in 2026.)
//
// REACHABILITY (Indonesia, confirmed 2026-06): api.allanime.day answers HTTP 403
// Cloudflare (solvable via FlareSolverr), NOT a DNS/SNI block like hianime/megacloud.

const API = process.env.ALLANIME_API || 'https://api.allanime.day/api';
// Host that serves the /clock.json source-resolver endpoint (allanime.day apex).
const CLOCK_HOST = process.env.ALLANIME_CLOCK_HOST || 'https://allanime.day';
// AllAnime gates the GraphQL API on Referer/Origin. ani-cli uses youtu-chan.com.
const REFERER = process.env.ALLANIME_REFERER || 'https://youtu-chan.com';
const ORIGIN = (() => {
  try {
    return new URL(REFERER).origin;
  } catch {
    return 'https://allanime.to';
  }
})();
const UA = config.userAgent;

// Persisted GraphQL queries (same shape ani-cli / animdl use against the live API).
const SEARCH_GQL =
  'query( $search: SearchInput $limit: Int $page: Int $translationType: VaildTranslationTypeEnumType $countryOrigin: VaildCountryOriginEnumType ) { shows( search: $search limit: $limit page: $page translationType: $translationType countryOrigin: $countryOrigin ) { edges { _id name availableEpisodes __typename } } }';
const EPISODE_GQL =
  'query ($showId: String!, $translationType: VaildTranslationTypeEnumType!, $episodeString: String!) { episode( showId: $showId translationType: $translationType episodeString: $episodeString ) { episodeString sourceUrls } }';

const gqlUrl = (query: string, variables: unknown): string =>
  `${API}?variables=${encodeURIComponent(JSON.stringify(variables))}&query=${encodeURIComponent(query)}`;

// The episode endpoint rejects the full query string (server-side "countryOfOrigin"
// bug → encrypted decoy payload). ani-cli instead sends Apollo persisted-query hashes
// (the server runs its own stored query), which returns plaintext sourceUrls. Hash is
// the live ani-cli episode hash; overridable if AllAnime rotates it.
const EPISODE_HASH =
  process.env.ALLANIME_EPISODE_HASH ||
  'd405d0edd690624b66baba3068e0edc3ac90f1597d898a1ec8db4e5c43c00fec';
const persistedUrl = (variables: unknown, hash: string): string =>
  `${API}?variables=${encodeURIComponent(JSON.stringify(variables))}` +
  `&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: hash } }))}`;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Set ALLANIME_DEBUG=1 to trace where resolution bails (search/episode/decode).
const dbg = (...a: unknown[]): void => {
  // eslint-disable-next-line no-console
  if (process.env.ALLANIME_DEBUG) console.warn('[allanime]', ...a);
};

// AllAnime obfuscates sourceUrl as a "-"/"--"-prefixed hex string, each byte XOR 56
// (0x38). This is exactly equivalent to ani-cli's giant sed substitution table
// (e.g. 79->A, 59->a, 08->0, 02->:, 17->/), verified byte-for-byte.
function decodeSource(s: string): string {
  if (!s || s[0] !== '-') return s;
  const hex = s.replace(/^-+/, '');
  let out = '';
  for (let i = 0; i + 1 < hex.length; i += 2) {
    out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ 56);
  }
  return out;
}

// AllAnime now AES-256-CTR-encrypts the episode payload in a `tobeparsed` field
// (the plaintext `episode.sourceUrls` is gone). Decryption mirrors ani-cli's
// process_response: key = SHA256("Xot36i3lK3:v1"); base64-decode the field; the
// 12-byte IV is bytes[1..13]; counter = IV ++ 00000002; ciphertext is bytes[13..-16]
// (the trailing 16 bytes are discarded). Returns the decrypted JSON text, or null.
const ALLANIME_KEY = createHash('sha256').update('Xot36i3lK3:v1').digest();
function decryptTobeparsed(b64: string): string | null {
  try {
    const buf = Buffer.from(b64, 'base64');
    const ctLen = buf.length - 13 - 16;
    if (ctLen <= 0) return null;
    const iv = buf.subarray(1, 13);
    const counter = Buffer.concat([iv, Buffer.from('00000002', 'hex')]);
    const ct = buf.subarray(13, 13 + ctLen);
    const d = createDecipheriv('aes-256-ctr', ALLANIME_KEY, counter);
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// ---- FlareSolverr: mint clearance once (cached), then fetch the API ourselves. ----
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
  const cookie = (j.solution.cookies || []).map((c) => `${c.name}=${c.value}`).join('; ');
  return { cookie, ua: j.solution.userAgent || UA };
}

// Cache cf_clearance per host. FlareSolverr's real-browser solve is the slow part
// (~tens of seconds); the cookie it returns is reusable over plain fetches. The TTL
// is an IDLE timeout that SLIDES forward on every successful reuse, so an active
// binge (episodes are ~24 min each) keeps the same cookie alive and never goes cold
// mid-watch. A genuine Cloudflare expiry is caught separately by the 403 → forced
// re-solve path in resolve(), so even when the cookie really dies it's a single ~12s
// blip, not a cold start per episode. Configurable via ALLANIME_CLEARANCE_TTL_MS.
const CLEARANCE_TTL_MS = Number(process.env.ALLANIME_CLEARANCE_TTL_MS) || 45 * 60 * 1000;
const clearanceCache = new Map<string, { clr: Clearance; at: number }>();
async function getClearance(url: string, force = false): Promise<Clearance> {
  const host = new URL(url).host;
  const hit = clearanceCache.get(host);
  if (!force && hit && Date.now() - hit.at < CLEARANCE_TTL_MS) {
    hit.at = Date.now(); // sliding: refresh the idle timer while it's actively used
    return hit.clr;
  }
  const clr = await fsSolve(url);
  clearanceCache.set(host, { clr, at: Date.now() });
  return clr;
}

async function apiGet(url: string, clr: Clearance): Promise<{ status: number; text: string }> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': clr.ua,
      Referer: REFERER,
      Origin: ORIGIN,
      ...(clr.cookie ? { Cookie: clr.cookie } : {}),
    },
  });
  return { status: res.status, text: await res.text() };
}

// ---- API response shapes ----
interface ShowEdge {
  _id: string;
  name: string;
  availableEpisodes?: { sub?: number; dub?: number };
}
interface SourceEntry {
  sourceUrl: string;
  sourceName?: string;
  type?: string;
  className?: string;
  priority?: number;
}
interface ClockSub {
  lang?: string;
  label?: string;
  src: string;
}
interface ClockLink {
  link?: string;
  src?: string;
  hls?: boolean;
  mp4?: boolean;
  resolutionStr?: string;
  subtitles?: ClockSub[];
}
interface ClockResponse {
  links?: ClockLink[];
  subtitles?: ClockSub[];
}

function pickShow(edges: ShowEdge[], titles: string[]): ShowEdge {
  const wanted = titles.map(norm).filter(Boolean);
  const exact = edges.find((e) => wanted.includes(norm(e.name)));
  if (exact) return exact;
  // Otherwise the result with the most available episodes (best heuristic match).
  return (
    [...edges].sort(
      (a, b) =>
        (b.availableEpisodes?.sub || 0) +
        (b.availableEpisodes?.dub || 0) -
        ((a.availableEpisodes?.sub || 0) + (a.availableEpisodes?.dub || 0))
    )[0] || edges[0]
  );
}

const langCode = (l?: string): string => (l || '').toLowerCase().split(/[-_]/)[0] || 'en';

function parseSources(text: string): SourceEntry[] {
  let json: { data?: { episode?: { sourceUrls?: SourceEntry[] }; tobeparsed?: string } };
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  // Plaintext path (older API).
  if (Array.isArray(json?.data?.episode?.sourceUrls)) {
    return json.data!.episode!.sourceUrls!;
  }
  // Encrypted path: data.tobeparsed (AES-256-CTR).
  const enc = json?.data?.tobeparsed;
  if (typeof enc !== 'string') return [];
  const dec = decryptTobeparsed(enc);
  if (!dec) return [];
  try {
    const inner = JSON.parse(dec);
    const arr =
      inner?.sourceUrls ||
      inner?.episode?.sourceUrls ||
      inner?.data?.episode?.sourceUrls ||
      (Array.isArray(inner) ? inner : null);
    if (Array.isArray(arr)) return arr;
  } catch {
    /* fall through to regex */
  }
  // Regex fallback (ani-cli style) if the decrypted shape is unexpected.
  return [...dec.matchAll(/"sourceUrl":"([^"]*)"/g)].map((m) => ({
    sourceUrl: m[1].replace(/\\u002[fF]/g, '/').replace(/\\\//g, '/'),
  }));
}

function readGraphQLError(text: string): string | null {
  try {
    const errors = JSON.parse(text)?.errors;
    if (!Array.isArray(errors)) return null;
    return errors.map((e) => e?.message).filter(Boolean).join('; ') || null;
  } catch {
    return null;
  }
}

function isCaptchaError(message: string | null): boolean {
  return /NEED_CAPTCHA|captcha/i.test(message || '');
}
export const allanime: Provider = {
  id: 'allanime',
  async resolve(params: WatchParams): Promise<ResolveResult | null> {
    const query = params.titles.find(Boolean);
    if (!query) return null;
    const translationType = params.category === 'dub' ? 'dub' : 'sub';

    // 1) Search. Clearance is cached per host, so this only pays FlareSolverr's slow
    //    browser solve on a cold start (or after the cookie expires → forced re-solve).
    const searchUrl = gqlUrl(SEARCH_GQL, {
      search: { allowAdult: false, allowUnknown: false, query },
      limit: 40,
      page: 1,
      translationType,
      countryOrigin: 'ALL',
    });
    const parseEdges = (text: string): ShowEdge[] | null => {
      try {
        return (JSON.parse(text)?.data?.shows?.edges as ShowEdge[]) ?? [];
      } catch {
        return null; // challenge HTML / not JSON
      }
    };

    let apiClr = await getClearance(searchUrl);
    let sr = await apiGet(searchUrl, apiClr);
    let edges = parseEdges(sr.text);
    if (edges === null || sr.status === 403) {
      apiClr = await getClearance(searchUrl, true); // cookie expired → re-solve once
      sr = await apiGet(searchUrl, apiClr);
      edges = parseEdges(sr.text);
    }
    dbg('search http', sr.status, 'edges', edges?.length ?? 'null');
    if (!edges || !edges.length) return null;

    const show = pickShow(edges, params.titles);
    dbg('picked', show._id, show.name);

    // 2) Episode source list (persisted-query hash → AES-decrypt tobeparsed).
    const epVars = { showId: show._id, translationType, episodeString: String(params.episode) };
    let er = await apiGet(persistedUrl(epVars, EPISODE_HASH), apiClr);
    let episodeError = readGraphQLError(er.text);
    let sourceUrls = isCaptchaError(episodeError) ? [] : parseSources(er.text);
    if (!sourceUrls.length) {
      er = await apiGet(gqlUrl(EPISODE_GQL, epVars), apiClr);
      const fallbackError = readGraphQLError(er.text);
      episodeError = fallbackError || episodeError;
      sourceUrls = isCaptchaError(fallbackError) ? [] : parseSources(er.text);
    }
    dbg('sourceUrls', sourceUrls.length, sourceUrls.map((s) => s.sourceName), episodeError || '');
    if (!sourceUrls.length) {
      if (isCaptchaError(episodeError)) {
        throw new Error('allanime episode source query blocked by captcha');
      }
      return null;
    }

    const decoded = sourceUrls.map((s) => ({
      name: s.sourceName || '?',
      priority: s.priority || 0,
      path: decodeSource(s.sourceUrl),
    }));
    dbg('decoded', decoded.map((d) => `${d.name}=${d.path.slice(0, 48)}`));

    const sources: Source[] = [];
    const subtitles: Subtitle[] = [];
    const seenSrc = new Set<string>();
    const seenSub = new Set<string>();
    const addSub = (sub?: ClockSub): void => {
      if (!sub || !sub.src || seenSub.has(sub.src)) return;
      seenSub.add(sub.src);
      subtitles.push({ url: sub.src, lang: langCode(sub.lang), label: sub.label || sub.lang || 'Subtitles' });
    };
    const addSource = (url: string | undefined, quality: string, isM3U8: boolean): void => {
      if (!url || seenSrc.has(url)) return;
      seenSrc.add(url);
      sources.push({ url, quality, isM3U8, headers: { Referer: REFERER } });
    };

    // 3a) Direct CDN links FIRST (fast path — no extra round-trips). AllAnime's own
    //     fast4speed/wixmp CDN serves a playable file directly. Skip third-party embed
    //     PAGES (ok.ru, mp4upload, youtube) — those are HTML players, not streams.
    const DIRECT_MEDIA = /(fast4speed\.rsvp|wixmp\.com|\.mp4(\?|$)|\.m3u8(\?|$))/i;
    for (const d of decoded) {
      if (!/^https?:\/\//.test(d.path) || d.path.includes('/clock')) continue;
      if (!DIRECT_MEDIA.test(d.path) || /youtu\.?be|youtube\.com|\/yt\b/i.test(d.path)) continue;
      const isM3U8 = /\.m3u8(\?|$)/i.test(d.path);
      addSource(d.path, isM3U8 ? 'auto' : d.name.toLowerCase(), isM3U8);
    }

    // 3b) Fallback: resolve /clock.json embeds only when no direct link worked (they're
    //     slower, often 500, and may need their own clearance). Clock clearance is also
    //     cached per host (force-refresh once on 403). These can carry soft-subs + an
    //     HLS quality ladder, so they're worth the cost only when direct is unavailable.
    if (!sources.length) {
      const clockEmbeds = decoded
        .filter((s) => s.path && s.path.includes('/clock'))
        .sort((a, b) => b.priority - a.priority);
      for (const item of clockEmbeds) {
        const clockPath = item.path.replace('/clock?', '/clock.json?');
        const clockUrl = clockPath.startsWith('http') ? clockPath : `${CLOCK_HOST}${clockPath}`;
        let clr = await getClearance(clockUrl);
        let r = await apiGet(clockUrl, clr);
        if (r.status === 403) {
          clr = await getClearance(clockUrl, true);
          r = await apiGet(clockUrl, clr);
        }
        dbg('clock', item.name, 'http', r.status);
        if (!r.text) continue;
        let parsed: ClockResponse;
        try {
          parsed = JSON.parse(r.text) as ClockResponse;
        } catch {
          continue;
        }
        for (const sub of parsed.subtitles || []) addSub(sub);
        for (const link of parsed.links || []) {
          const url = link.link || link.src;
          if (!url) continue;
          for (const sub of link.subtitles || []) addSub(sub);
          const isM3U8 = link.hls === true || /\.m3u8(\?|$)/i.test(url);
          addSource(url, link.resolutionStr || (isM3U8 ? 'auto' : 'default'), isM3U8);
        }
        if (sources.some((s) => s.isM3U8)) break; // got a usable HLS stream
      }
    }

    dbg('sources', sources.length, 'subs', subtitles.length);
    if (!sources.length) return null;

    // Prefer HLS first (the player + /hls proxy want m3u8); keep mp4 as backup.
    sources.sort((a, b) => Number(Boolean(b.isM3U8)) - Number(Boolean(a.isM3U8)));
    return { provider: 'allanime', sources, subtitles, headers: { Referer: REFERER } };
  },
};
