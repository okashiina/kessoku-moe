// Probe KAA-like providers (direct HLS + separate soft subtitles) and how fresh
// their airing catalog is. Prints a JSON summary per provider only: it never
// writes third-party HTML/JS to disk and never executes it (plain fetch + regex).
//
// Usage (from services/source-service):
//   node scripts/probe-kaa-alternatives.mjs "One Piece" 1
//   node scripts/probe-kaa-alternatives.mjs "Frieren" latest
//
// "latest" asks AniList for the newest aired episode and probes that one, which is
// the real test for "how fast does this site get new episodes".
//
// Candidates (see docs/PROVIDER-SHORTLIST-2026-11.md):
//   anizone   https://anizone.to    vidstack player JSON -> HLS + separate VTT/ASS
//   hianimeat https://hianime.at    ZokoAnime embed blob  -> HLS + separate VTT
//                                   (the flow ani-cli v5.1 ships, 2026-09)

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const TITLE = process.argv[2] || 'One Piece';
const EP_ARG = process.argv[3] || '1';
const TIMEOUT_MS = 20000;

const host = (u) => {
  try {
    return new URL(u).host;
  } catch {
    return null;
  }
};
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

async function get(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  const challenged = /<title>\s*Just a moment/i.test(text) || res.status === 403;
  return { status: res.status, text, challenged };
}

function fail(stage, err) {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return { ok: false, stage, error: msg.slice(0, 200) };
}

// Fetch a master playlist and summarise it (variants, demuxed audio, CDN host).
async function checkPlaylist(url, referer) {
  try {
    const r = await get(url, referer ? { Referer: referer, Origin: referer.replace(/\/$/, '') } : {});
    const isM3u8 = r.text.trimStart().startsWith('#EXTM3U');
    return {
      ...(process.env.PROBE_SHOW_URLS ? { url, referer } : {}),
      status: r.status,
      host: host(url),
      isM3u8,
      variants: (r.text.match(/#EXT-X-STREAM-INF/g) || []).length,
      resolutions: [...r.text.matchAll(/RESOLUTION=\d+x(\d+)/g)].map((m) => m[1]),
      audioTracks: [...r.text.matchAll(/#EXT-X-MEDIA:TYPE=AUDIO[^\n]*LANGUAGE="([^"]+)"/g)].map((m) => m[1]),
      subtitleTracksInManifest: (r.text.match(/#EXT-X-MEDIA:TYPE=SUBTITLES/g) || []).length,
    };
  } catch (e) {
    return { host: host(url), error: String(e).slice(0, 160) };
  }
}

// ---- AniList: newest aired episode, for the freshness comparison. ----
async function anilistInfo(title) {
  const query = `query($s:String){Media(search:$s,type:ANIME,sort:SEARCH_MATCH){id title{romaji english}
    status episodes nextAiringEpisode{episode airingAt}}}`;
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query, variables: { s: title } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const m = (await res.json())?.data?.Media;
    if (!m) return null;
    const latestAired = m.nextAiringEpisode
      ? m.nextAiringEpisode.episode - 1
      : m.episodes || null;
    return {
      id: m.id,
      titles: [m.title.english, m.title.romaji].filter(Boolean),
      status: m.status,
      latestAired,
      nextAiringAt: m.nextAiringEpisode
        ? new Date(m.nextAiringEpisode.airingAt * 1000).toISOString()
        : null,
    };
  } catch {
    return null;
  }
}

function pickByTitle(items, titles, getTitles) {
  const wanted = titles.map(norm);
  return (
    items.find((i) => getTitles(i).some((t) => wanted.includes(norm(t)))) || items[0] || null
  );
}

// ---- AniZone (Laravel + Livewire + vidstack) ----
const ANIZONE = 'https://anizone.to';

// Values are embedded as JSON.parse('...'): a JS string literal (inside an HTML
// attribute) holding JSON. Undo the HTML entities, then the JS literal escapes in ONE
// pass (so "\\u0022" stays an escaped quote for JSON), then parse the JSON.
function anizoneJsonArg(html, re) {
  const m = html.match(re);
  if (!m) return null;
  const unescaped = m[1]
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
  const decoded = unescaped.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, e) =>
    e.length === 5 ? String.fromCharCode(parseInt(e.slice(1), 16)) : e
  );
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

async function probeAnizone(titles, episode) {
  const out = { provider: 'anizone', site: ANIZONE };
  let slug;
  try {
    // Its search misses some English titles, so fall back through every candidate.
    let items = [];
    for (const t of [...new Set(titles)]) {
      const r = await get(`${ANIZONE}/anime?search=${encodeURIComponent(t)}`, {
        Referer: `${ANIZONE}/`,
      });
      out.searchStatus = r.status;
      if (r.challenged) return { ...out, ...fail('search', 'Cloudflare challenge (try FlareSolverr)') };
      items = anizoneJsonArg(r.text, /items\s*:\s*JSON\.parse\('((?:[^'\\]|\\.)*)'\)/i) || [];
      if (items.length) break;
    }
    // title_list may be an array or a {lang: title} object; flatten either to strings.
    const flat = (v) =>
      v == null ? [] : typeof v === 'string' ? [v] : Object.values(v).flatMap(flat);
    const show = pickByTitle(items, titles, (i) => [i.main_title, ...flat(i.title_list)]);
    if (!show?.slug) return { ...out, ...fail('search', `no match in ${items.length} results`) };
    slug = show.slug;
    out.match = { slug, title: show.main_title, episodeCount: show.episode_count ?? null };
    // The search card's count tracks uploaded episodes: our freshness signal.
    out.providerLatest = Number(show.episode_count) || 0;
  } catch (e) {
    return { ...out, ...fail('search', e) };
  }

  if (episode === 'latest') episode = out.match.episodeCount || 1;
  out.episode = episode;
  try {
    const r = await get(`${ANIZONE}/anime/${slug}/${episode}`, {
      Referer: `${ANIZONE}/anime/${slug}`,
    });
    out.watchStatus = r.status;
    const player = anizoneJsonArg(r.text, /vidstackPlayer\s*\(\s*JSON\.parse\('((?:[^'\\]|\\.)*)'\)\s*\)/i);
    if (!player?.src) return { ...out, ...fail('watch', 'vidstack player payload not found') };
    const src = String(player.src).replace(/\\+\//g, '/');
    const subs = (player.subtitles || []).filter((s) => s && s.file);
    out.subtitles = subs.map((s) => ({
      lang: s.language || s.srclang || '',
      label: s.title || '',
      format: s.format || 'vtt',
      host: host(String(s.file).replace(/\\+\//g, '/')),
      default: Boolean(s.default),
    }));
    out.playlist = await checkPlaylist(src, `${ANIZONE}/`);
    out.ok = Boolean(out.playlist.isM3u8);
  } catch (e) {
    return { ...out, ...fail('watch', e) };
  }
  return out;
}

// ---- hianime.at (HiAnime-theme clone; ZokoAnime embed) ----
const HIAT = 'https://hianime.at';
const XOR_KEY = Buffer.from('otaku-embed-v1');

// The embed page ships its config as base64(json XOR "otaku-embed-v1").
function deobfuscate(b64) {
  const bytes = Buffer.from(b64, 'base64');
  for (let i = 0; i < bytes.length; i += 1) bytes[i] ^= XOR_KEY[i % XOR_KEY.length];
  return JSON.parse(bytes.toString('utf8'));
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? m[1] : null;
};
const unwrapHtml = (text) => {
  try {
    const j = JSON.parse(text);
    return typeof j.html === 'string' ? j.html : text;
  } catch {
    return text.replace(/\\"/g, '"').replace(/\\\//g, '/');
  }
};

async function probeHianimeAt(titles, episode, category) {
  const out = { provider: 'hianimeat', site: HIAT };
  let animeId;
  try {
    const r = await get(`${HIAT}/search?keyword=${encodeURIComponent(titles[0])}`);
    out.searchStatus = r.status;
    if (r.challenged) return { ...out, ...fail('search', 'Cloudflare challenge (try FlareSolverr)') };
    const main = r.text.split('id="main-sidebar"')[0];
    const items = [
      ...main.matchAll(/class="film-name">\s*<a href="[^"]*\/([^"/?]+)"[^>]*title="([^"]*)"/g),
    ].map((m) => ({ slug: m[1], title: m[2].replace(/&#039;/g, "'").replace(/&amp;/g, '&') }));
    const show = pickByTitle(items, titles, (i) => [i.title]);
    if (!show) return { ...out, ...fail('search', `no match in ${items.length} results`) };
    animeId = show.slug.split('-').pop();
    out.match = { slug: show.slug, title: show.title };
  } catch (e) {
    return { ...out, ...fail('search', e) };
  }

  let eps;
  try {
    const r = await get(`${HIAT}/api/theme/episode/list/${animeId}`, { Referer: `${HIAT}/` });
    const html = unwrapHtml(r.text);
    eps = [...html.matchAll(/<a[^>]*ep-item[^>]*>/g)]
      .map((m) => ({ number: Number(attr(m[0], 'data-number')), id: attr(m[0], 'data-id') }))
      .filter((e) => e.number && e.id);
    out.providerLatest = eps.length ? Math.max(...eps.map((e) => e.number)) : 0;
  } catch (e) {
    return { ...out, ...fail('episodes', e) };
  }

  if (episode === 'latest') episode = out.providerLatest;
  out.episode = episode;
  const ep = eps.find((e) => e.number === Number(episode));
  if (!ep) return { ...out, ...fail('episodes', `episode ${episode} not listed`) };

  try {
    const r = await get(`${HIAT}/api/theme/episode/servers?episodeId=${ep.id}`, { Referer: `${HIAT}/` });
    const html = unwrapHtml(r.text);
    const servers = [...html.matchAll(/<[^>]*server-item[^>]*>/g)].map((m) => ({
      type: attr(m[0], 'data-type'),
      name: attr(m[0], 'data-server-name'),
      hash: attr(m[0], 'data-hash'),
    }));
    out.servers = servers.map((s) => `${s.type}:${s.name}`);
    const zoko = servers.find((s) => s.type === category && /zoko/i.test(s.name || '') && s.hash);
    if (!zoko) return { ...out, ...fail('servers', `no ZokoAnime ${category} server`) };
    const embed = Buffer.from(zoko.hash, 'base64').toString('utf8');
    const referer = embed.replace(/^(https?:\/\/[^/]+).*/, '$1/');
    out.embedHost = host(embed);

    const er = await get(embed, { Referer: `${HIAT}/` });
    const blob = er.text.match(/window\.__P="([^"]*)"/)?.[1];
    if (!blob) return { ...out, ...fail('embed', 'window.__P blob not found (embed changed?)') };
    const cfg = deobfuscate(blob);
    const json = JSON.stringify(cfg);
    const src = json.match(/"src":"([^"]*\.m3u8[^"]*)"/)?.[1];
    if (!src) return { ...out, ...fail('embed', 'no m3u8 in embed config') };
    const subs = [...json.matchAll(/\{[^{}]*"src":"([^"]*\.(?:vtt|srt|ass)[^"]*)"[^{}]*\}/g)].map((m) => {
      const o = JSON.parse(m[0]);
      return { lang: o.srclang || o.lang || '', label: o.label || '', host: host(m[1]), default: Boolean(o.default) };
    });
    out.subtitles = subs;
    out.playlist = await checkPlaylist(src, referer);
    out.ok = Boolean(out.playlist.isM3u8);
  } catch (e) {
    return { ...out, ...fail('watch', e) };
  }
  return out;
}

// ---- main ----
const al = await anilistInfo(TITLE);
const titles = al?.titles?.length ? al.titles : [TITLE];
const episode = EP_ARG === 'latest' ? (al?.latestAired ? String(al.latestAired) : 'latest') : EP_ARG;
const category = process.env.CATEGORY || 'sub';

const results = await Promise.all([
  probeAnizone(titles, episode),
  probeHianimeAt(titles, episode, category),
]);

for (const r of results) {
  if (al?.latestAired && r.providerLatest != null) {
    r.freshness = r.providerLatest >= al.latestAired ? 'up-to-date' : `behind by ${al.latestAired - r.providerLatest}`;
  }
}

console.log(JSON.stringify({ query: TITLE, category, anilist: al, episode, results }, null, 2));
