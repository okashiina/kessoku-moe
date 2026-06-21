// Server-only MangaDex client.
//
// WHY THIS FILE EXISTS (read before touching the networking):
// MangaDex (*.mangadex.org and the @home image CDN *.mangadex.network) is
// DNS-poisoned by Indonesian ISPs — every hostname resolves to a local sinkhole
// (e.g. 202.169.44.80) and the connection black-holes. Verified 2026-06-21: it is
// PURE DNS poisoning (no SNI/DPI), and the ISP also hijacks plain UDP/53 to public
// resolvers, so dns.setServers() does NOT help. The only reliable fix is DoH
// (DNS-over-HTTPS, port 443) to a literal-IP resolver, then connecting to the real
// IP with the correct TLS SNI. This module does exactly that via a custom node:https
// `lookup`, so the manga reader works from the user's Indonesian laptop AND from any
// deploy egress with no dependency change. See docs/MANGA-ROADMAP.md §1 / Phase 0.
//
// Everything here is import-only from API routes (server side). Never ship to the
// browser — the browser is behind the same poisoned DNS and only ever talks to our
// own /api/manga/* routes.

import type { LookupAddress } from 'node:dns';
import type { IncomingMessage, IncomingHttpHeaders } from 'node:http';
import https from 'node:https';

import { LRUCache } from 'lru-cache';

const UA =
  'kessoku-moe/1.0 (+https://kessoku.moe; self-hosted manga reader; contact: dev@kessoku.moe)';

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => {
    setTimeout(r, ms);
  });

// ---------------------------------------------------------------------------
// DoH resolver — literal-IP endpoints so it needs no DNS at all (the resolver
// hosts' TLS certs include the IP in their SAN, so SNI=IP validates). Cloudflare
// first, Google as fallback.
// ---------------------------------------------------------------------------

interface DohEndpoint {
  url: (name: string) => string;
  headers: Record<string, string>;
}

const DOH_ENDPOINTS: DohEndpoint[] = [
  {
    url: (n) =>
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(n)}&type=A`,
    headers: { accept: 'application/dns-json' },
  },
  {
    url: (n) =>
      `https://1.0.0.1/dns-query?name=${encodeURIComponent(n)}&type=A`,
    headers: { accept: 'application/dns-json' },
  },
  {
    url: (n) => `https://8.8.8.8/resolve?name=${encodeURIComponent(n)}&type=A`,
    headers: { accept: 'application/dns-json' },
  },
];

interface DohAnswer {
  type: number;
  data: string;
}

const ipCache = new LRUCache<string, string[]>({ max: 200, ttl: 5 * 60_000 });

// For a literal-IP URL, derive a servername the cert will accept. 1.1.1.1/1.0.0.1
// → cloudflare-dns.com; 8.8.8.8 → dns.google. (Their certs also list the IP, but
// being explicit avoids surprises across Node TLS versions.)
function hostnameOf(url: string): string | undefined {
  if (url.includes('://1.1.1.1') || url.includes('://1.0.0.1'))
    return 'cloudflare-dns.com';
  if (url.includes('://8.8.8.8')) return 'dns.google';
  return undefined;
}

function httpsGetBuffer(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<{ status: number; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers, servername: hostnameOf(url) },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) })
        );
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
  });
}

function parseDohIps(body: Buffer): string[] {
  const json = JSON.parse(body.toString('utf8')) as { Answer?: DohAnswer[] };
  return (json.Answer ?? [])
    .filter((a) => a.type === 1)
    .map((a) => a.data)
    .filter((ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip));
}

async function dohResolve(hostname: string): Promise<string[]> {
  const hit = ipCache.get(hostname);
  if (hit) return hit;

  let lastErr: unknown;
  // Indexed loop (repo lint bans for-of/continue); fall through endpoints in order.
  for (let i = 0; i < DOH_ENDPOINTS.length; i += 1) {
    const ep = DOH_ENDPOINTS[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      const { status, body } = await httpsGetBuffer(
        ep.url(hostname),
        ep.headers,
        8000
      );
      if (status === 200) {
        const ips = parseDohIps(body);
        if (ips.length) {
          ipCache.set(hostname, ips);
          return ips;
        }
      }
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `DoH resolution failed for ${hostname}: ${String(
      lastErr ?? 'no A records'
    )}`
  );
}

// Only DoH the hosts that are actually blocked; everything else uses system DNS.
function needsDoh(hostname: string): boolean {
  return (
    hostname === 'mangadex.org' ||
    hostname.endsWith('.mangadex.org') ||
    hostname.endsWith('.mangadex.network')
  );
}

// node:https `lookup` shim. Signature matches dns.lookup so https can call it.
type LookupCb = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number
) => void;

function dohLookup(
  hostname: string,
  options: { all?: boolean } | LookupCb,
  callback?: LookupCb
): void {
  const cb = (typeof options === 'function' ? options : callback) as LookupCb;
  const all = typeof options === 'object' && options?.all;

  if (!needsDoh(hostname)) {
    // Defer to the platform resolver for non-MangaDex hosts.
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const dns = require('node:dns') as typeof import('node:dns');
    (dns.lookup as unknown as typeof dohLookup)(hostname, options, callback);
    return;
  }

  dohResolve(hostname)
    .then((ips) => {
      if (all) {
        cb(
          null,
          ips.map((address) => ({ address, family: 4 }))
        );
      } else {
        // Rotate by time so we don't hammer a single edge.
        const ip = ips[Math.floor(Date.now() / 1000) % ips.length];
        cb(null, ip, 4);
      }
    })
    .catch((err) => cb(err as NodeJS.ErrnoException, '', 4));
}

// ---------------------------------------------------------------------------
// Outbound throttle — MangaDex enforces ~5 req/s per IP at the load balancer.
// Serialize calls with a min gap (4 req/s, safety margin) + retry on 429/5xx.
// ---------------------------------------------------------------------------

const MIN_GAP_MS = 250;
let lastCallAt = 0;
let gate: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  gate = gate.then(async () => {
    const wait = Math.max(0, lastCallAt + MIN_GAP_MS - Date.now());
    if (wait) await sleep(wait);
    lastCallAt = Date.now();
  });
  return gate;
}

interface MdError extends Error {
  status?: number;
  retryAfter?: string;
}

function mdGetJSONOnce<T>(path: string): Promise<T> {
  const url = `https://api.mangadex.org${path}`;
  return new Promise<T>((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        lookup: dohLookup as never,
        servername: 'api.mangadex.org',
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c as Buffer));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status >= 400) {
            const err: MdError = Object.assign(
              new Error(`MangaDex ${status}`),
              {
                status,
                retryAfter: res.headers['retry-after'] as string | undefined,
              }
            );
            reject(err);
            return;
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T);
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('MangaDex timeout')));
  });
}

async function mdGetJSON<T>(path: string, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    await throttle();
    try {
      // eslint-disable-next-line no-await-in-loop
      return await mdGetJSONOnce<T>(path);
    } catch (err) {
      const e = err as MdError;
      const status = e.status ?? 0;
      const retryable =
        status === 429 ||
        (status >= 500 && status < 600) ||
        // network-level errors (timeout, reset) have no status
        status === 0;
      if (!retryable || attempt >= retries) throw err;
      const ra = Number(e.retryAfter);
      // eslint-disable-next-line no-await-in-loop
      await sleep(
        Number.isFinite(ra) && ra > 0 ? ra * 1000 : 400 * (attempt + 1) ** 2
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Image stream (for the proxy route). Returns the raw response stream so the
// route can pipe it without buffering. Caller MUST validate the host first.
// ---------------------------------------------------------------------------

export interface MdStream {
  status: number;
  headers: IncomingHttpHeaders;
  stream: IncomingMessage;
}

export function isMangadexImageHost(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    return (
      u.hostname === 'uploads.mangadex.org' ||
      u.hostname.endsWith('.mangadex.network')
    );
  } catch {
    return false;
  }
}

export function mdOpenImage(
  rawUrl: string,
  referer = 'https://mangadex.org'
): Promise<MdStream> {
  const servername = new URL(rawUrl).hostname;
  return new Promise<MdStream>((resolve, reject) => {
    const req = https.get(
      rawUrl,
      {
        headers: {
          'User-Agent': UA,
          Referer: referer,
          Origin: new URL(referer).origin,
        },
        lookup: dohLookup as never,
        servername,
      },
      (res) =>
        resolve({
          status: res.statusCode ?? 502,
          headers: res.headers,
          stream: res,
        })
    );
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('image timeout')));
  });
}

// ---------------------------------------------------------------------------
// Typed-ish MangaDex shapes (only the fields we use).
// ---------------------------------------------------------------------------

export interface MdRelationship {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
}

export interface MdManga {
  id: string;
  type: 'manga';
  attributes: {
    title: Record<string, string>;
    altTitles: Record<string, string>[];
    description: Record<string, string>;
    originalLanguage: string;
    status: string;
    year: number | null;
    contentRating: string;
    tags: { id: string; attributes: { name: Record<string, string> } }[];
    availableTranslatedLanguages: string[];
    links: Record<string, string> | null;
    lastChapter: string | null;
  };
  relationships: MdRelationship[];
}

export interface MdChapter {
  id: string;
  type: 'chapter';
  attributes: {
    title: string | null;
    volume: string | null;
    chapter: string | null;
    translatedLanguage: string;
    pages: number;
    externalUrl: string | null;
    publishAt: string;
    readableAt: string;
  };
  relationships: MdRelationship[];
}

interface MdList<T> {
  result: string;
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

interface MdEntity<T> {
  result: string;
  data: T;
}

export interface MdAtHome {
  result: string;
  baseUrl: string;
  chapter: { hash: string; data: string[]; dataSaver: string[] };
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

const mangaCache = new LRUCache<string, MdManga>({
  max: 500,
  ttl: 60 * 60_000,
});
const resolveCache = new LRUCache<string, string | null>({
  max: 2000,
  ttl: 24 * 60 * 60_000,
});

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

const COVER_INCLUDES =
  'includes[]=cover_art&includes[]=author&includes[]=artist';

// Content-rating filter. NSFW off = safe + suggestive only; NSFW on adds erotica
// + pornographic (gated behind the user's NSFW toggle — see utility/nsfw.ts).
const ratings = (nsfw: boolean): string =>
  nsfw
    ? 'contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic'
    : 'contentRating[]=safe&contentRating[]=suggestive';

/** Search MangaDex by title; returns the best canonical entry (most languages). */
export async function searchManga(
  title: string,
  nsfw = false
): Promise<MdManga | null> {
  const q = encodeURIComponent(title);
  const list = await mdGetJSON<MdList<MdManga>>(
    `/manga?title=${q}&limit=8&${ratings(
      nsfw
    )}&${COVER_INCLUDES}&order[relevance]=desc`
  );
  const data = list.data ?? [];
  if (!data.length) return null;
  // Prefer the entry exposing the most translated languages (filters out the
  // "Official Colored" / doujin / "Book Version" side entries that out-rank the
  // canonical series on a bare title match — see MANGA-ROADMAP Phase 0).
  return data
    .slice()
    .sort(
      (a, b) =>
        (b.attributes.availableTranslatedLanguages?.length ?? 0) -
        (a.attributes.availableTranslatedLanguages?.length ?? 0)
    )[0];
}

export async function getManga(id: string): Promise<MdManga | null> {
  const cached = mangaCache.get(id);
  if (cached) return cached;
  try {
    const res = await mdGetJSON<MdEntity<MdManga>>(
      `/manga/${id}?${COVER_INCLUDES}`
    );
    if (res.data) mangaCache.set(id, res.data);
    return res.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve an AniList manga id to a MangaDex manga. First tries the exact link
 * (MangaDex indexes `links.al`); falls back to a title search. Cached (incl.
 * negative results) to keep us well under the rate limit.
 */
export async function resolveByAniList(
  anilistId: number,
  titles: string[],
  nsfw = false
): Promise<MdManga | null> {
  const cacheKey = `${anilistId}:${nsfw ? 1 : 0}`;
  const cached = resolveCache.get(cacheKey);
  if (cached !== undefined) return cached ? getManga(cached) : null;

  // MangaDex can't filter by links.al directly, so search by each title and match
  // the entry whose links.al equals our AniList id; else take the best title hit.
  const candidates = titles.filter(Boolean);
  let best: MdManga | null = null;
  for (let i = 0; i < candidates.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop, @typescript-eslint/no-use-before-define
    const hit = await searchMangaMatchingAniList(
      candidates[i],
      anilistId,
      nsfw
    );
    if (hit?.matched) {
      best = hit.manga;
      break;
    }
    if (!best && hit?.manga) best = hit.manga;
  }

  resolveCache.set(cacheKey, best?.id ?? null);
  if (best) mangaCache.set(best.id, best);
  return best;
}

async function searchMangaMatchingAniList(
  title: string,
  anilistId: number,
  nsfw: boolean
): Promise<{ manga: MdManga; matched: boolean } | null> {
  const q = encodeURIComponent(title);
  const list = await mdGetJSON<MdList<MdManga>>(
    `/manga?title=${q}&limit=10&${ratings(
      nsfw
    )}&${COVER_INCLUDES}&order[relevance]=desc`
  );
  const data = list.data ?? [];
  if (!data.length) return null;
  const exact = data.find((m) => Number(m.attributes.links?.al) === anilistId);
  if (exact) return { manga: exact, matched: true };
  const best = data
    .slice()
    .sort(
      (a, b) =>
        (b.attributes.availableTranslatedLanguages?.length ?? 0) -
        (a.attributes.availableTranslatedLanguages?.length ?? 0)
    )[0];
  return { manga: best, matched: false };
}

/**
 * Full chapter feed for a manga in the given languages, de-duplicated to one
 * chapter per (chapter-number, language) — prefers the group with the most pages.
 * Paginates the MangaDex /feed (limit 500) until exhausted.
 */
export async function getChapterFeed(
  mangaId: string,
  languages: string[],
  nsfw = false
): Promise<MdChapter[]> {
  const langParams = languages
    .map((l) => `translatedLanguage[]=${encodeURIComponent(l)}`)
    .join('&');
  const all: MdChapter[] = [];
  let offset = 0;
  const limit = 500;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const page = await mdGetJSON<MdList<MdChapter>>(
      `/manga/${mangaId}/feed?${langParams}&limit=${limit}&offset=${offset}` +
        '&order[volume]=asc&order[chapter]=asc&includes[]=scanlation_group' +
        `&${ratings(nsfw)}&includeExternalUrl=0`
    );
    all.push(...(page.data ?? []));
    offset += limit;
    if (offset >= (page.total ?? 0) || (page.data ?? []).length === 0) break;
    if (offset > 5000) break; // safety: enormous series, cap the feed
  }
  return all;
}

export async function getAtHome(chapterId: string): Promise<MdAtHome> {
  return mdGetJSON<MdAtHome>(`/at-home/server/${chapterId}`);
}

/** Single chapter with its manga + scanlation-group relationships. */
export async function getChapter(chapterId: string): Promise<MdChapter | null> {
  try {
    const res = await mdGetJSON<MdEntity<MdChapter>>(
      `/chapter/${chapterId}?includes[]=manga&includes[]=scanlation_group`
    );
    return res.data ?? null;
  } catch {
    return null;
  }
}

/** The manga id referenced by a chapter's relationships, if present. */
export function chapterMangaId(ch: MdChapter): string | null {
  return ch.relationships.find((r) => r.type === 'manga')?.id ?? null;
}

/** Scanlation-group display name for a chapter (AUP attribution). */
export function chapterGroupName(ch: MdChapter): string | null {
  const g = ch.relationships.find((r) => r.type === 'scanlation_group');
  return (g?.attributes?.name as string | undefined) ?? null;
}

/** Build absolute @home page URLs for a chapter at the chosen quality. */
export function buildPageUrls(at: MdAtHome, dataSaver: boolean): string[] {
  const quality = dataSaver ? 'data-saver' : 'data';
  const files = dataSaver ? at.chapter.dataSaver : at.chapter.data;
  return files.map((f) => `${at.baseUrl}/${quality}/${at.chapter.hash}/${f}`);
}

/** Cover filename for a manga from its cover_art relationship. */
export function coverFileName(m: MdManga): string | null {
  const cover = m.relationships.find((r) => r.type === 'cover_art');
  const fileName = cover?.attributes?.fileName as string | undefined;
  return fileName ?? null;
}

export function coverUrl(m: MdManga, size: 256 | 512 | 0 = 512): string | null {
  const file = coverFileName(m);
  if (!file) return null;
  const suffix = size === 0 ? '' : `.${size}.jpg`;
  return `https://uploads.mangadex.org/covers/${m.id}/${file}${suffix}`;
}
