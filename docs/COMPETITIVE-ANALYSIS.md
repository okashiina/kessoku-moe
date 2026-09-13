# Competitive Analysis — anime streaming apps → refining "kessoku moe"

Research date: 2026-06-02. Sources: each site's public pages (most are Cloudflare/anti-bot
gated, so detail is corroborated with GitHub source, reverse-engineering repos, FMHY,
EverythingMoe, r/animepiracy, and security scanners). Confidence noted per claim.

This feeds [STREAMING-ROADMAP.md](STREAMING-ROADMAP.md). Our app is being rebranded
**animeflix → "kessoku moe"** (logo + brand guidelines pending from the owner; the
Midnight Aurora accent is one swappable token, see [DESIGN.md](DESIGN.md)).

---

## 1. At-a-glance matrix

| Site | What it is | Player | Sources / delivery | Killer features |
| --- | --- | --- | --- | --- |
| **Miruro** | Polished AniList-backed aggregator (best-reviewed UI) | **Vidstack** (@vidstack/react) | Self-hosted **m3u8 proxy** over aliased backends (zoro=HiAnime, pahe=AnimePahe, +kiwi/arc/jet, AnimeKai). **Encrypted** FE↔BE "secure pipe" | AniList sync, skip intro/outro, theater, screenshot, audio-boost, multi-domain + status page |
| **AnimePahe** | Minimalist, self-encoded low-bandwidth | **Kwik** (own host, obfuscated) | **Re-encodes content itself** → own CDN, referer-locked HLS; DDoS-Guard | Tiny file sizes, first-class downloads (quality+size+lang), clean search-first UI |
| **kaa.lt = KickAssAnime** (NOT "Kaido") | KissAnime-successor, sub+dub | Custom HLS player, server switch | Self-hosted API, **many named servers**, m3u8 + Referer injection; Cloudflare | Soft multilingual subs, Auto-Next, schedule, multi-domain + Discord/Telegram |
| **Animetsu** | Young aggregator ("YouTube×Crunchyroll") | HTML5 HLS (artplayer/vidstack-class) + **server switcher** | **m3u8 proxy** over `mega-cloud.top` (HiAnime family) + servers `pahe/kite/fsoft` w/ **latency probing** | Auto-next, PiP, preview, MAL import, mobile-first, download endpoint |
| **AnimeX** (animex.one) | Feature-maximal aggregator | **ArtPlayer** (toggleable) | Multi-provider, user-**reorderable provider list**; Cloudflare | AniList sync (85%-watched auto-complete), **Watch Together** + chat, filler skip, 9 themes, hero trailer, torrent/OST downloads, PWA |
| **Anidap** (anidap.se) | Clean ad-free aggregator | HLS player (lib unverified) | "12+ providers", aggregator, m3u8-proxy (inferred); Cloudflare | **AniList+MAL sync**, threaded comments, schedule + countdowns, **OP/ED player**, profile avatars/banners |
| **Seanime** | OSS self-hosted media server (Go+React, Electron "Denshi") | Built-in (ASS subs, Anime4K) / MPV/VLC / web transcode | **Extension provider system** (JS/Goja): online-stream + manga + torrent providers; **torrent/Debrid streaming**, **transcoding** | AniList sync, auto-downloader, AniSkip, playlists, offline, extension marketplace |

---

## 2. Cross-cutting patterns (what the field has converged on)

1. **Self-hosted m3u8 proxy beats embed iframes.** Every serious competitor (Miruro,
   Animetsu, KAA, almost certainly AnimeX/Anidap) extracts streams from multiple
   backends, normalizes to **HLS**, and serves through **its own proxy** that rewrites
   playlist/segment URLs and **injects `Referer`/`Origin`** to defeat CDN origin checks.
   This is exactly our **Option B**. It's what unlocks our own player, soft subs
   (incl. **Indonesian**), skip markers, and PiP.
2. **Multi-provider "servers" with fallback.** Sources are presented as switchable
   servers; the best (Animetsu) **probe latency** and auto-pick; AnimeX lets users
   **reorder provider preference**. One dead backend ≠ a dead title. (= our SOP #1/#3.)
3. **The provider ecosystem is small & shared:** **HiAnime/Zoro** (megacloud /
   `mega-cloud.top`), **AnimePahe** (kwik, re-encoded), **AllAnime/AllManga**,
   **AnimeKai**, GogoAnime (dying). Miruro's aliases: `zoro/pahe/kiwi/arc/jet`.
4. **AniList is the universal metadata + sync layer.** Catalog, filters, autosuggest,
   seasonal rails, schedule, and two-way progress sync all fall out of AniList GraphQL
   for ~free. MAL usually only via import/bridge. (We already use AniList.)
5. **Two players dominate: Vidstack and ArtPlayer.** Both are HLS-capable, support skip
   markers, PiP, quality, subtitle styling, keyboard. Miruro (the UI benchmark) uses
   **Vidstack (React)**; AnimeX uses ArtPlayer.
6. **Skip intro/outro via AniSkip**, **auto-next**, **resume position**, **continue
   watching** are table-stakes QoL — but they need **our own player** (cross-origin
   embed iframes expose no playback state, so we can't read time/skip with embeds).
7. **Anti-fragility is productized:** multi-domain mirrors + public **status page** +
   **Discord/Telegram**; Miruro additionally **encrypts** FE↔BE traffic to deter
   leeching/scraping.
8. **Cheap delight that recurs:** airing **schedule + countdowns**, **filler-aware**
   episode lists (skip fillers), **theme switcher**, **OP/ED player**, downloads with
   quality/size/language, hero trailer.

---

## 3. Where WE stand vs. the field (gap analysis)

Our app today: AniList metadata ✓, **embed-iframe switcher** (4 providers) ✓, Home
(trending/popular/top + localStorage "continue watching") ✓, basic search ✓, genre
page ✓, watch page (episode grid + provider dropdown + dub toggle) ✓, Midnight Aurora
redesign ✓.

| Capability | Field standard | Us now | Gap |
| --- | --- | --- | --- |
| Playback | Own HLS player (Vidstack/ArtPlayer) | Third-party **embed iframe** | **Big** (blocks subs/skip/PiP/progress) |
| Sources | Self-hosted multi-provider m3u8 proxy + fallback | Embed switcher (per-title gaps) | **Big** (= Option B, parked) |
| AniList **sync** | Two-way, auto-complete ~85% | localStorage only | Medium |
| Continue watching | Cross-device (AniList) | localStorage last-episode | Medium |
| Skip intro/outro, auto-next, resume | Standard (AniSkip) | None | Needs own player |
| Browse **filters** | genre/year/season/format/status/sort + autosuggest + A-Z | genre page + basic search | Medium (AniList = free) |
| Schedule / countdowns | Common | None | Small (AniList data) |
| Filler awareness | AnimeX | None | Small |
| Indonesian subs | KAA soft multi-sub | Not possible w/ embeds | Needs own player |
| Comments / Watch Together | Anidap / AnimeX | None | Optional |
| Themes / PWA / status page / Discord | Common | next-pwa present, rest none | Small |

---

## 4. Recommendations for kessoku moe (prioritized)

Split by what works **now on the embed pipeline (free, client-side)** vs. what needs
**Option B (own player + m3u8 proxy, needs the 2 GB box)**. This extends the roadmap.

### Tier 1 — do now, embed-compatible, zero hosting cost
These are pure frontend + AniList GraphQL, high value, low risk:

1. **AniList OAuth sync — BUILT (2026-06-04, code-complete; needs an app +
   `NEXT_PUBLIC_ANILIST_CLIENT_ID` + `ANILIST_CLIENT_SECRET` to go live).** **Authorization
   code grant** (AniList rejects implicit grant); a server route does the token exchange so
   the secret never reaches the browser. Token ~1yr. Two-way: pull-merge on login, debounce
   conservative push of watchlist + progress (never downgrades AniList). Augments the local
   stores rather than replacing them (keeps offline use). See STREAMING-ROADMAP §8a.
2. **Browse/Filter pages — DONE** (`/browse` with genre, year, season, format, status,
   sort; `/schedule` exists too). **Search autosuggest — BUILT (2026-06-04).** A-Z still
   open. All AniList GraphQL.
3. **Airing schedule + countdowns — DONE** (`/schedule`, AniList `airingSchedules`, next 7
   days, grouped today-first).
4. **Smarter embed switcher — BUILT (2026-06-04):** remembers the working provider per
   title (`kessoku.embed.byTitle`) and **auto-falls-back** through servers on a stall
   (was manual-only); a manual pick pauses auto-advance. Reorderable preference still open.
5. **Filler-aware episode grid — DONE** — marks filler eps (AnimeFillerList).
6. **Mark-as-watched on episode open** → push to AniList (the only progress signal we
   *can* get from an embed, since the iframe is cross-origin).
7. **Polish:** theme switcher (we have tokens), PWA install, a `/status` page + Discord
   link, OP/ED player (AniList has theme data via AnimeThemes).
8. **Watch Later rail — BUILT (2026-06-04, round 2):** a home rail of PLANNING titles below
   My List. AniList-synced via the existing status store.
9. **Voice-actor + studio discovery — BUILT (2026-06-04, round 2):** cast (character + JP VA)
   + studio on the detail page, dedicated `/studio/[id]` + `/staff/[id]` pages, and
   Anime / Studios / Voice actors search tabs. No rival in the matrix surfaces VA/studio
   browsing; all AniList GraphQL. See STREAMING-ROADMAP §8b.

> Honest constraint: **resume-position, skip intro/outro, PiP, auto-next, soft subs
> (incl. Indonesian) are NOT possible over a cross-origin embed iframe** — we can't read
> or control the third-party player. They require Tier 2.

### Tier 2 — needs Option B (own player + m3u8 proxy on a 2 GB box / home PC)
When hosting is available (see roadmap §4/§5a), this closes the big gaps at once:

1. **Vidstack player** (React, matches our Next.js stack and the best-reviewed
   competitor Miruro). Unlocks soft **VTT subs incl. Indonesian**, **skip intro/outro
   (AniSkip)**, PiP, quality selector, **auto-next + resume**, theater, screenshot.
2. **Multi-provider source-service** (our skeleton): HiAnime/Zoro + AnimePahe +
   AllAnime + AnimeKai, normalized to HLS, **server switcher + latency probing +
   auto-fallback**, **embed switcher stays as last resort** (SOP #2).
3. **m3u8 proxy** (already scaffolded) with Referer/Origin injection + caching +
   circuit breaker; optional **encrypted FE↔BE pipe** (Miruro-style) to deter leeching.
4. **Watch Together** (sync playback + chat) — only feasible with our own player.
5. **AI watch companion** (*built 2026-06-04, live chat pending a free API key* — roadmap §11):
   an in-player chat persona grounded on the synopsis + an anti-spoiler subtitle window, with
   selectable tone. No competitor in the matrix ships this; it is the one differentiator our own
   player uniquely enables (the direct player's timestamp + subtitle access give scene-level
   spoiler-safety). Default model = free Gemini 2.0 Flash; Groq is an env swap.

### Player decision
**Vidstack** (`@vidstack/react`). Rationale: React-native (our stack), HLS via hls.js,
built-in skip markers/PiP/keyboard/speed/theater, and it's what the UI benchmark
(Miruro) ships. ArtPlayer (AnimeX) is the alternative but is vanilla-JS-first.

---

## 5. Concrete UI/UX borrows (for the ongoing redesign)
- **Miruro:** speed + minimalism as the brand; theater mode; screenshot; customizable
  character-name language; "force max quality."
- **AnimeX:** **reorderable provider preference**, filler-skip toggles, named theme
  switcher, autoplay hero trailer, subtitle styling (size/color/bg/position).
- **Animetsu:** server **latency probing** + auto-pick; episode hover **preview**;
  mobile-first. (Avoid its bug: fake fullscreen with forced comment overlay.)
- **Anidap:** **threaded comments**, schedule **countdowns**, **OP/ED player**, profile
  avatars/banners.
- **AnimePahe:** downloads listing **quality + file size + language**; search-first.
- **Seanime:** **provider = small swappable module** behind a stable interface
  (search → episodes → server) — the cleanest anti-fragility model; AniList as the only
  catalog source of truth; AniSkip markers.
- **Anti-takedown (all):** multi-domain mirrors + public status page + Discord.

---

## Shipped reader usability (2026-09-13)

The manga/manhwa reader now closes a common long-strip usability gap with
opt-in, adjustable auto-scroll (20–180 px/s) and a single top-edge progress
indicator shared by continuous and paged navigation. Manual input pauses motion,
and reduced-motion preferences disable auto-scroll. Continuous progress mirrors
the clamped native scrollbar position in both directions and resyncs as lazy images
change the document height. The change keeps the current layout intact and adds no
dependency.
