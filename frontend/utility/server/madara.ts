// Server-only Madara / WP-Manga provider (manhwatop.com).
//
// WHY: licensed Korean BL/adult webtoons (e.g. the Lezhin Original "The Pizza
// Delivery Man and the Gold Palace") aren't on MangaDex (delisted), ComicK
// (official-only, no hosted images), or Weebcentral (B&W only). manhwatop.com is
// a Madara-theme aggregator that hosts the full-color pages, has the title (102
// chapters, verified 2026-06-21), and is reachable from Indonesia directly (not
// DNS-blocked, no Cloudflare challenge). English. HTML-scraped, regex-based,
// degrades to null/[] on any failure.
//
// Madara is a common WordPress manga theme, so this also generalizes to other
// Madara sites later by swapping HOST.

import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from 'node:child_process';
import { Readable } from 'node:stream';
import { promisify } from 'node:util';

import { LRUCache } from 'lru-cache';

const execFileP = promisify(execFile);

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const HOST = 'manhwatop.com';
const BASE = `https://${HOST}`;
export const MADARA_REFERER = `${BASE}/`;

// Page images live on hashed subdomains (c1/c2/...manhwatop.com) under
// /manga_<hash>/chapter_<n>/. Allowlist the domain for the proxy SSRF guard.
export function isMadaraImageHost(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return (
      u.protocol === 'https:' &&
      (u.hostname === HOST || u.hostname.endsWith(`.${HOST}`))
    );
  } catch {
    return false;
  }
}

// manhwatop sits behind Cloudflare bot protection that 403s Node's undici fetch
// (its TLS/HTTP fingerprint is flagged) while curl's fingerprint passes. So we
// shell out to the system `curl` (present on Windows 10+ and Railway/Linux) for
// every manhwatop request — HTML and images alike. Verified 2026-06-21: undici
// gets "Just a moment" 403, curl gets 200.
//
// IP CAVEAT (the prod fix): Cloudflare also blocks datacenter IPs, so from a
// cloud host (Railway) even curl gets the "Just a moment" challenge — the title
// reads fine on a residential connection (localhost) but shows "No readable
// chapters" in prod. Set MANHWATOP_PROXY to a residential egress to make the
// requests look like a home connection again. Accepts any curl proxy URL:
//   - paid residential proxy:  http://user:pass@host:port  (always-on)
//   - free self-hosted:        socks5://127.0.0.1:1080 tunnelled from a home
//     machine (e.g. over Tailscale) — costs nothing but needs that box awake.
// Unset (the default, and localhost) = direct curl, unchanged behavior.
const proxyUrl = (): string => process.env.MANHWATOP_PROXY?.trim() || '';

const curlArgs = (url: string): string[] => {
  const proxy = proxyUrl();
  return [
    ...(proxy ? ['--proxy', proxy] : []),
    '-s',
    '-L',
    '--compressed',
    '--max-time',
    // A residential proxy adds latency, and image bytes flow through it, so give
    // proxied requests a longer ceiling than direct curl.
    proxy ? '45' : '25',
    '-A',
    UA,
    '-H',
    `Referer: ${MADARA_REFERER}`,
    url,
  ];
};

// Optional RELAY: a residential machine that does the actual fetch and returns
// the bytes (see tools/manhwatop-proxy/relay.mjs). Needed in the cloud because
// Cloudflare blocks the Linux container's curl TLS fingerprint even through a
// residential proxy — only the bytes' source IP changes, not the fingerprint
// doing the TLS handshake. The relay fetches with a fingerprint that passes and
// hands back the bytes, so the container never speaks TLS to manhwatop. Set
// MANHWATOP_RELAY (base URL) + MANHWATOP_RELAY_KEY. Unset = direct curl (local).
const relayBase = (): string =>
  process.env.MANHWATOP_RELAY?.trim().replace(/\/$/, '') || '';
const relayKey = (): string => process.env.MANHWATOP_RELAY_KEY?.trim() || '';
export const relayEnabled = (): boolean => relayBase().length > 0;

async function fetchViaRelay(target: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(
      `${relayBase()}/f?u=${encodeURIComponent(target)}`,
      {
        headers: { 'x-relay-key': relayKey() },
        signal: controller.signal,
      }
    );
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url: string): Promise<string | null> {
  if (relayEnabled()) {
    const res = await fetchViaRelay(url);
    return res ? res.text() : null;
  }
  try {
    const { stdout } = await execFileP('curl', curlArgs(url), {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout || null;
  } catch {
    return null;
  }
}

/** Stream a manhwatop image through curl (Cloudflare-safe). The image proxy pipes
 *  proc.stdout to the response. */
export function streamMadaraImage(url: string): ChildProcessWithoutNullStreams {
  return spawn('curl', curlArgs(url));
}

/** Image bytes via the relay, as a Node stream. Null if the relay is off or the
 *  fetch failed. The image route prefers this when MANHWATOP_RELAY is set. */
export async function relayImageStream(
  target: string
): Promise<Readable | null> {
  const res = await fetchViaRelay(target);
  if (!res || !res.body) return null;
  return Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
}

export function madaraImageContentType(url: string): string {
  const u = url.toLowerCase();
  if (u.endsWith('.png')) return 'image/png';
  if (u.endsWith('.webp')) return 'image/webp';
  if (u.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export interface MadaraSeries {
  slug: string;
  title: string;
}
export interface MadaraChapter {
  slug: string; // e.g. "chapter-83"
  num: number;
  label: string;
}

const seriesCache = new LRUCache<string, MadaraSeries | null>({
  max: 1000,
  ttl: 24 * 60 * 60_000,
});
const chaptersCache = new LRUCache<string, MadaraChapter[]>({
  max: 500,
  ttl: 30 * 60_000,
});

const STOP = new Set([
  'the',
  'and',
  'of',
  'a',
  'an',
  'to',
  'in',
  'on',
  'for',
  'with',
  'no',
]);
const toks = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length >= 2 && !STOP.has(t));

/** Search manhwatop (Madara WP-Manga) and return the best-matching series. */
export async function searchMadara(
  query: string,
  altTitles: string[] = []
): Promise<MadaraSeries | null> {
  const key = toks(query).join(' ');
  const cached = seriesCache.get(key);
  if (cached !== undefined) return cached;

  const html = await getText(
    `${BASE}/?s=${encodeURIComponent(query)}&post_type=wp-manga`
  );
  // Don't cache a transient fetch failure as a negative — retry next time.
  if (!html) return null;

  // Madara search-result links wrap the thumbnail (no title text), so match on
  // the SLUG instead: collect unique /manga/{slug}/ links and score the slug's
  // words against the query + AniList alt titles.
  const slugs = Array.from(
    new Set(
      Array.from(
        html.matchAll(new RegExp(`https://${HOST}/manga/([^/"]+)/`, 'g'))
      )
        .map((mm) => mm[1])
        .filter((s) => !s.includes('chapter'))
    )
  );
  if (!slugs.length) {
    seriesCache.set(key, null);
    return null;
  }

  const qTokens = toks(query);
  const want = new Set([query, ...altTitles].flatMap(toks));
  const ranked = slugs
    .map((slug) => ({
      slug,
      s: toks(slug.replace(/-/g, ' ')).filter((t) => want.has(t)).length,
    }))
    .sort((a, b) => b.s - a.s);
  const need = Math.min(
    qTokens.length,
    Math.max(2, Math.ceil(qTokens.length * 0.6))
  );
  const best: MadaraSeries | null =
    ranked[0].s >= need
      ? { slug: ranked[0].slug, title: ranked[0].slug.replace(/-/g, ' ') }
      : null;
  seriesCache.set(key, best);
  return best;
}

const chapNum = (slug: string): number => {
  const m = /chapter-([\d]+(?:[.-]\d+)?)/i.exec(slug);
  return m ? parseFloat(m[1].replace('-', '.')) : 0;
};

export async function getMadaraChapters(
  slug: string
): Promise<MadaraChapter[]> {
  const cached = chaptersCache.get(slug);
  if (cached) return cached;

  const html = await getText(`${BASE}/manga/${slug}/`);
  if (!html) return [];

  const out: MadaraChapter[] = [];
  const seen = new Set<string>();
  // Slugs are [a-z0-9-] (regex-safe), so interpolate directly.
  const re = new RegExp(
    `https://${HOST}/manga/${slug}/(chapter-[\\d.-]+)/?`,
    'gi'
  );
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(html)) !== null) {
    const chSlug = m[1].toLowerCase();
    if (seen.has(chSlug)) continue; // eslint-disable-line no-continue
    seen.add(chSlug);
    const n = chapNum(chSlug);
    out.push({
      slug: chSlug,
      num: n,
      label: `Chapter ${chSlug.replace('chapter-', '')}`,
    });
  }
  out.sort((a, b) => a.num - b.num);
  chaptersCache.set(slug, out);
  return out;
}

export async function getMadaraPages(
  slug: string,
  chapterSlug: string
): Promise<string[]> {
  const html = await getText(`${BASE}/manga/${slug}/${chapterSlug}/`);
  if (!html) return [];
  // Real page images sit under /manga_<hash>/chapter_<n>/ on a manhwatop subdomain;
  // src or data-src (lazy). Filter to that path to skip the logo / wp-content assets.
  const re =
    /(?:src|data-src)="(https:\/\/[a-z0-9.-]*manhwatop\.com\/[^"]*manga_[^"]+\.(?:jpg|jpeg|png|webp))"/gi;
  const urls: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(html)) !== null) {
    const u = m[1].trim();
    if (!seen.has(u)) {
      seen.add(u);
      urls.push(u);
    }
  }
  return urls;
}
