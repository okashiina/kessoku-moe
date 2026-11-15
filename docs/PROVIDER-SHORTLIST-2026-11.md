# Provider Shortlist: KAA-like Sources (2026-11)

Goal: find a **second provider shaped like KAA** (`providers/kaa.ts`): a direct HLS
stream with clean JP video, **separate soft subtitles** our player can style, and fast
pickup of newly aired episodes. This builds on
[PROVIDER-SHORTLIST.md](PROVIDER-SHORTLIST.md) and
[SOURCE-RESEARCH-CONTINUATION-2026-06-25.md](SOURCE-RESEARCH-CONTINUATION-2026-06-25.md).

> Research date: 2026-11-15. Desk research only. Every candidate host (and kaa.lt
> itself) is blocked by the network policy of the cloud sandbox this was written in, so
> **nothing here is live-verified**. Run the probe below from the home network before
> wiring anything.

## What changed since June

- **ani-cli dropped AllAnime.** v5.0 (Aug 2026) moved to `anidb.app`, and v5.1
  (Sep 2026) replaced that with **`hianime.at`**: the HiAnime-theme site and its
  "ZokoAnime" embed, which returns an m3u8 plus a separate VTT subtitle list. ani-cli
  is the most closely maintained extractor in this space, so its pick is a strong
  liveness signal.
- **Multi-provider scraper APIs** (Kuhi / `aryaniiil/anime-api`, forked as
  `HappyS2307/scrapanime-api`) list 10 providers as working on 2026-10-09, KAA among
  them. Their code is the best reference for current site flows.

## Ranked candidates

| # | Provider | Stream | Subtitles | Sub / Dub | Extraction | Verdict |
|---|---|---|---|---|---|---|
| **1** | **AniZone** (`anizone.to`) | HLS (vidstack player) | **Separate tracks** (`subtitles[]` with `file`, `language`, `format` vtt/ass), plus storyboard and chapters | Sub only (dub list is empty upstream) | Plain HTML. Search `/anime?search=` reads the `items: JSON.parse('…')` payload. Watch `/anime/<slug>/<ep>` reads the `vidstackPlayer(JSON.parse('…'))` payload. Pagination is Livewire `loadPage` (CSRF + snapshot). No crypto. | **Integrate first.** It's the closest match to KAA: clean HLS plus separate multi-language subs, and it's cheap to extract. Its reputation is fast simulcast pickup (not verified; the probe's `latest` mode checks it). |
| **2** | **hianime.at** (ZokoAnime embed) | HLS master with demuxed audio (`EXT-X-MEDIA TYPE=AUDIO`), like KAA | Separate VTT list in the embed config, with a `default` flag | Sub + dub | `/search?keyword=` → `/api/theme/episode/list/<id>` → `/api/theme/episode/servers?episodeId=` → base64 `data-hash` = embed URL → `window.__P` = base64(JSON XOR `"otaku-embed-v1"`). The stream needs `Referer` = embed origin. | **Integrate second.** Sub + dub, KAA-shaped manifest, and a living reference (ani-cli v5.1). The risk is the HiAnime name: clones of it get takedowns, and the XOR key can rotate (ani-cli will patch it first). |
| 3 | AnimeOnsen (`animeonsen.xyz`) | **DASH**, not HLS | Separate per-language tracks (`uri.subtitles`), bearer token | Sub only | Session cookie `ao.session` → bearer token → `/v4/content/<id>/video/<ep>`. Needs a modern Chrome UA. | **Later.** The soft-sub/raw model is ideal, but our player is hls.js, so DASH needs dash.js or Shaka first. Its catalog is smaller (Kuhi's test show had 26 eps). |
| 4 | anibd (`epeng.animeapps.top`) | HLS + embed | Not stated | Sub only | AniList-keyed JSON API, simple | **Probe only.** Easy API, but nobody states whether the subs are hard or soft. Check before investing. |
| — | AniNeko (`anineko.to`) | HLS via MegaPlay-class embeds | Burned in (embed servers) | Sub + dub | HTML + embed HLS extraction | **Skip for soft-sub.** Good coverage, but it's an embed re-host, not KAA-shaped. |
| — | mkissa | HLS/direct | — | Sub + dub + raw | Runs on the **AllAnime backend** | **Skip.** It inherits AllAnime's `NEED_CAPTCHA` problem. |
| — | reanime, animetsu-api | — | — | — | Reference repos archived (Oct / Jul 2026) | **Skip.** Unmaintained. |

## Recommended Auto chain once verified

```
PROVIDERS=kaa,anizone,hianimeat,animepahe,allanime
```

KAA stays primary. AniZone and hianime.at both serve clean video with soft subs, so the
subtitle overlay keeps working when KAA misses an episode. AnimePahe stays the hardsub
safety net. Dub requests can skip AniZone (it has no dub).

## How to verify (run from the home network)

`services/source-service/scripts/probe-kaa-alternatives.mjs` prints only a JSON
summary. It never saves third-party HTML/JS and never runs it.

```bash
cd services/source-service
node scripts/probe-kaa-alternatives.mjs "Frieren" 1
node scripts/probe-kaa-alternatives.mjs "One Piece" latest
CATEGORY=dub node scripts/probe-kaa-alternatives.mjs "Dandadan" 1
```

For each provider it reports the matched show, the episode the provider has reached
(`providerLatest`) compared with AniList's newest aired episode (`freshness`), the
subtitle tracks and their hosts, and the master playlist (status, CDN host, variants,
audio languages). A `Cloudflare challenge` error means that provider needs the existing
FlareSolverr path (same as `kaa.ts`).

What decides go / no-go:
1. `playlist.isM3u8: true` with status 200 through the Referer we pass.
2. `subtitles` non-empty. Then watch one episode to confirm the video has **no burned-in subs**.
3. `freshness: up-to-date` on a currently airing show, ideally within a few hours of airing.
4. The CDN and subtitle hosts are reachable from Indonesia (not SNI-blocked like megacloud).

## Sources

- ani-cli releases (v4.15 → v5.0 anidb.app → v5.1 hianime.at): <https://github.com/pystardust/ani-cli/releases>
- ani-cli current script (hianime.at / ZokoAnime flow): <https://github.com/pystardust/ani-cli>
- Kuhi anime-api (provider table tested 2026-10-09, provider code): <https://github.com/aryaniiil/anime-api>
- scrapanime-api fork: <https://github.com/HappyS2307/scrapanime-api>
- anidap-scraper (other multi-provider reference): <https://github.com/vaishnavxd/anidap-scraper>
- Anivault-API (zokoanime / anikoto / miruro scrapers): <https://github.com/SH0MIK/Anivault-API>
