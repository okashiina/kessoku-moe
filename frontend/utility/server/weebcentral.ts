// Server-only Weebcentral provider.
//
// WHY: MangaDex aggressively honors DMCA takedowns, so big licensed series
// (Solo Leveling, Jujutsu Kaisen, One Piece) and a lot of BL/adult manhwa have
// few or zero readable chapters there. Weebcentral hosts its own page images and
// keeps those titles, is reachable from Indonesia (no DNS block, no Cloudflare),
// and serves referer-gated images we proxy. Verified 2026-06-21 end-to-end:
// Solo Leveling + the BL title "Delivery" both returned real PNGs.
//
// English-only in practice. It is the licensed/adult fallback behind MangaDex
// (which still owns Indonesian + Japanese + general manga). HTML-scraped (no
// public JSON API), so the parsing is regex-based and intentionally defensive —
// every function degrades to null/[] rather than throwing.

import { LRUCache } from 'lru-cache';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BASE = 'https://weebcentral.com';

// Weebcentral serves page images from a rotating set of Hyperdimension-Neptunia
// themed CDN hosts. Allowlist the families so the image proxy can validate hosts
// (SSRF guard) without hardcoding every subdomain.
const WEEB_IMAGE_HOST_RE = /(^|\.)(planeptune|lastation|lowee|leanbox)\.us$/i;

export function isWeebImageHost(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    return u.protocol === 'https:' && WEEB_IMAGE_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

export const WEEB_REFERER = `${BASE}/`;

async function getText(
  url: string,
  init?: RequestInit
): Promise<string | null> {
  // Node fetch has no default timeout; bound it with an AbortController
  // (AbortSignal.timeout isn't in this project's TS lib target).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        'User-Agent': UA,
        Referer: WEEB_REFERER,
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface WeebSeries {
  id: string;
  title: string;
}

export interface WeebChapter {
  id: string; // weebcentral chapter id
  num: number;
  label: string;
}

const seriesCache = new LRUCache<string, WeebSeries | null>({
  max: 1000,
  ttl: 24 * 60 * 60_000,
});
const chaptersCache = new LRUCache<string, WeebChapter[]>({
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

const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length >= 2 && !STOP.has(t));

async function runWeebSearch(query: string): Promise<WeebSeries[]> {
  const html = await getText(`${BASE}/search/simple?location=main`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ text: query }).toString(),
  });
  if (!html) return [];
  const results: WeebSeries[] = [];
  const re =
    /href="https:\/\/weebcentral\.com\/series\/([A-Z0-9]+)\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    const title = m[2].replace(/<[^>]+>/g, '').trim();
    if (id && title && !results.some((r) => r.id === id)) {
      results.push({ id, title });
    }
  }
  return results;
}

/**
 * Search Weebcentral and return the best-matching series. Weebcentral's search
 * is token-fuzzy and trips on stopwords (the full title can rank a wrong result
 * above the right one, e.g. it lists the BL "The Pizza Delivery Man and the Gold
 * Palace" simply as "Delivery"). So we search with a stopword-stripped query,
 * gather candidates, and pick the one with the most shared significant tokens
 * against the query + AniList alt titles — not exact string equality.
 */
export async function searchWeeb(
  query: string,
  altTitles: string[] = []
): Promise<WeebSeries | null> {
  const key = tokens(query).join(' ');
  const cached = seriesCache.get(key);
  if (cached !== undefined) return cached;

  const qTokens = tokens(query);
  const wantTokens = new Set([query, ...altTitles].flatMap(tokens));

  // Try the stopword-stripped query first (most reliable), then the raw query.
  const cleaned = qTokens.join(' ');
  let results = await runWeebSearch(cleaned || query);
  if (!results.length && cleaned !== query)
    results = await runWeebSearch(query);
  if (!results.length) {
    seriesCache.set(key, null);
    return null;
  }

  const score = (title: string): number =>
    tokens(title).filter((t) => wantTokens.has(t)).length;

  const ranked = results
    .map((r) => ({ r, s: score(r.title) }))
    .sort((a, b) => b.s - a.s);

  // Require a STRONG overlap, not just one shared word — otherwise a long title
  // like "The Pizza Delivery Man and the Gold Palace" wrongly matched weeb's
  // unrelated B&W "Delivery". Need ~60% of the query's significant tokens (min 2,
  // capped at how many the query actually has, so 1-word titles need that 1).
  const need = Math.min(
    qTokens.length,
    Math.max(2, Math.ceil(qTokens.length * 0.6))
  );
  const best = ranked[0].s >= need ? ranked[0].r : null;
  seriesCache.set(key, best);
  return best;
}

const chapNum = (label: string): number => {
  const m = /([\d]+(?:\.\d+)?)/.exec(label);
  return m ? parseFloat(m[1]) : 0;
};

/** Full chapter list for a series, ascending by chapter number. */
export async function getWeebChapters(
  seriesId: string
): Promise<WeebChapter[]> {
  const cached = chaptersCache.get(seriesId);
  if (cached) return cached;

  const html = await getText(`${BASE}/series/${seriesId}/full-chapter-list`);
  if (!html) return [];

  const out: WeebChapter[] = [];
  const seen = new Set<string>();
  // <a href="https://weebcentral.com/chapters/{ID}"> ... <span ...>Chapter 12</span>
  const re =
    /href="https:\/\/weebcentral\.com\/chapters\/([A-Z0-9]+)"[\s\S]*?<span[^>]*>([^<]*?(?:Chapter|Episode|Vol)[^<]*?)<\/span>/gi;
  let m: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue; // eslint-disable-line no-continue
    seen.add(id);
    const label = m[2].replace(/\s+/g, ' ').trim();
    out.push({ id, num: chapNum(label), label });
  }
  // Fallback: if the span pattern misses, at least grab the chapter ids in order.
  if (!out.length) {
    const idRe = /\/chapters\/([A-Z0-9]+)/g;
    let mm: RegExpExecArray | null;
    let i = 0;
    // eslint-disable-next-line no-cond-assign
    while ((mm = idRe.exec(html)) !== null) {
      if (seen.has(mm[1])) continue; // eslint-disable-line no-continue
      seen.add(mm[1]);
      i += 1;
      out.push({ id: mm[1], num: i, label: `Chapter ${mm[1]}` });
    }
  }

  out.sort((a, b) => a.num - b.num);
  chaptersCache.set(seriesId, out);
  return out;
}

/** Page image URLs for a chapter (absolute, on the Weebcentral CDN). */
export async function getWeebPages(chapterId: string): Promise<string[]> {
  const html = await getText(
    `${BASE}/chapters/${chapterId}/images?is_prev=False&current_page=1&reading_style=long_strip`
  );
  if (!html) return [];
  const re = /https:\/\/[a-z0-9.-]+\/manga\/[^"'\s]+?\.(?:png|jpg|jpeg|webp)/gi;
  const urls = html.match(re) ?? [];
  // De-dup while preserving order.
  return Array.from(new Set(urls));
}
