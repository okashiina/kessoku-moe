# Animeflix — Self-Hosted Streaming Roadmap (Option B)

Goal: own the video pipeline (own player UI, quality control, Indonesian subtitles)
like Miruro does, **without** inheriting its "heavy & fragile" failure modes.

This is a living plan. Phase 0 (embed switcher) is already shipped as the safety net.

---

## 1. What we learned from Miruro (verified via Playwright network probe)

- Miruro runs its **own backend** (`/api/secure/pipe`) that scrapes **multiple
  providers** server-side — confirmed payloads referenced `animepahe:…` (provider
  "kiwi") and `allmanga:…` / AllAnime (provider "ally").
- It **proxies the HLS** (`*.ultracloud.cc/…/pl.m3u8`) through its own domain to
  beat CORS/Referer, and plays it in its **own player** (hence quality + subs).
- API responses are **encrypted** (ECDH key from `/api/secure/jwks`) to stop reuse.
- **The catch (verified):** even the "lighter" sources are anti-bot gated —
  AllAnime returned `403 Just a moment…` (Cloudflare) from our IP; AnimePahe uses
  DDoS-Guard. Miruro beats this with heavy infra (Cloudflare solving + proxies).
  **From a Railway datacenter IP this is worse, not better.**

Conclusion: Option B is viable but it is an *operations* problem, not a code
problem. The SOP below exists to keep it from becoming the thing that breaks.

---

## 2. Target architecture

```
[ Next.js frontend + own player (vidstack/artplayer/OSS module) ]
                 │  GET /api/watch?anilistId=&ep=&category=
                 ▼
[ source-service ]  (separate Node service, NOT on a datacenter IP)
   ├─ resolver: provider fallback chain (priority-ordered)
   │     1. AllAnime   2. AnimePahe   3. HiAnime  4. … 
   ├─ anti-bot layer:  FlareSolverr / Playwright pool / residential proxy
   ├─ cache:           (anilistId,ep,provider) -> sources  [short TTL]
   └─ returns:         { sources:[{url,quality}], subtitles:[{lang,url}], headers }
                 │
                 ▼
[ /api/hls-proxy ]  rewrites playlist + segment URLs, injects Referer/Origin
                 │
                 ▼
[ /api/subs ]  OpenSubtitles (id) -> .srt -> .vtt  (Indo subtitles, our domain)
```

Key point: **the embed-iframe switcher (Phase 0) stays as the automatic last
resort.** If the whole self-hosted path fails, the player falls back to embeds so
the site never goes fully dark.

---

## 3. STRICT SOP — mitigating "heavy & fragile"

These are non-negotiable rules. Each maps to a concrete failure we expect.

1. **Provider abstraction + fallback chain.** Every source lives behind one
   interface (`search / episodes / sources`). The resolver tries providers in
   priority order; first playable source wins. **Never** ship a single-provider path.
2. **Embed fallback is mandatory.** If all self-hosted providers fail for a title,
   the API returns `{mode:"embed"}` and the player loads the Phase-0 iframe. The
   site degrades, never dies.
3. **Circuit breaker per provider.** N failures in a window → mark provider "open"
   (skip) for a cooldown, auto half-open retry. One dead source never slows every
   request.
4. **Canary monitoring + alerts.** A cron canary every 5–10 min resolves a known
   popular title on each provider, asserts a valid m3u8 + first segment loads, and
   posts per-provider up/down to a `/status` page + a Discord/Telegram webhook.
   You learn a provider broke **before** users do.
5. **Contract tests vs. live sites (nightly CI).** Each provider's parser has a
   test hitting the real site. When their HTML/encryption changes and the test
   fails, CI alerts. This is what turns "fragile" into "monitored".
6. **Caching everywhere.** Cache resolved sources (10–30 min TTL) and subtitles
   (long TTL). Cuts latency, load, and anti-bot exposure.
7. **Config-as-data.** Provider base URLs, proxy creds, keys, priorities all in
   env/DB — swap a dead provider domain or proxy **without a redeploy**.
8. **Anti-bot with backoff.** FlareSolverr/proxy pool with bounded retries +
   exponential backoff; never hammer (that gets the IP banned faster).
9. **Observability.** Structured logs + per-provider success-rate/latency metrics +
   an error taxonomy (network / challenge / parse / no-source).
10. **Staged rollout via feature flag.** Default = embed. Flip self-host **per
    provider** only after its canary is green for X days. Reversible instantly.
11. **Low profile / legal posture.** Rate-limit, no public hotlinking, keep it
    personal-scale, be DMCA-ready (this is the reality that killed gogoanime).

---

## 4. Hosting (off Railway)

Railway datacenter IPs are heavily challenged. Options, cheapest→most robust:
- **A small VPS** (Hetzner/Contabo/etc.) running source-service + FlareSolverr.
  Some provider challenges pass from a clean VPS IP; cheap to start.
- **+ Residential/ISP rotating proxy** (paid, e.g. per-GB) for the providers that
  still challenge a VPS IP. This is the real unlock and the main recurring cost.
- Frontend (Next.js) can stay anywhere (Vercel/Railway); only the source-service
  needs the special egress.

---

## 5. Phases & decision gates

- **Phase 0 — DONE.** Embed switcher live = safety net.
- **Phase 1 — WIRED & PLAYING (2026-06-03).** End-to-end playback confirmed in a
  real browser: **FlareSolverr (Docker) + AnimePahe** → kwik → m3u8 → `/hls` proxy
  (injects `Referer: https://kwik.cx/`) → **hls.js** on the watch page (`mode:'direct'`),
  embed switcher kept as the bidirectional fallback. One gotcha solved: AnimePahe/kwik
  mis-signals AAC-LC audio as **AAC-Main (`mp4a.40.1`)**, which Chrome can't
  `addSourceBuffer`; a tiny MSE shim remaps it to `mp4a.40.2` so it decodes. Player UX
  polish is the next round — see **§8**.
- **Phase 2 — Resilience.** Add 2–3 fallback providers + caching + circuit breakers
  + canary monitoring + `/status`. Gate: canary >95% green for a week.
  **Provider decision (2026-06-03 — see [STREAMING-SOURCES-RESEARCH.md](STREAMING-SOURCES-RESEARCH.md)):**
  a March 2026 Crunchyroll DMCA wave froze `aniwatch`/`consumet` upstream (the npm
  packages still install). **HiAnime/Zoro via `aniwatch` is the only true soft-sub
  source** (returns separate multi-language WebVTT) → implement as
  `providers/hianime.ts`, but its page hosts are ISP-blocked from the laptop
  (522 / SNI hang), so extraction is **VPS-gated** — and per the 2026 provider
  re-survey ([PROVIDER-SHORTLIST.md](PROVIDER-SHORTLIST.md)) HiAnime DIED ~2026-03-13
  and AnimeKai 2026-05-10, so the soft-sub dream is effectively dead and the VPS case
  is now low-value (don't push it). **AllAnime — DONE & VERIFIED LIVE (2026-06-03),
  wired as fallback** (`providers/allanime.ts`): CF-only (FlareSolverr clears it, not
  SNI-blocked). Working recipe = full-query search + **persisted-query HASH** for the
  episode (full query trips a server bug) + **AES-256-CTR decrypt of `data.tobeparsed`**
  (key `SHA256("Xot36i3lK3:v1")`) + Referer `youtu-chan.com`; reliable source is its
  fast4speed CDN **direct MP4** (hardsub, Referer-gated) served via the new **`/file`
  Range proxy** (`src/fileProxy.ts`); player got a native-`<video>` path for non-HLS.
  Full method in [ALLANIME-PROVIDER.md](ALLANIME-PROVIDER.md) §0. **Provider-order
  decision (2026-06-05): AllAnime is now PRIMARY** (`PROVIDERS=allanime,animepahe`) by
  user preference — best picture + freshest airing/dub — with AnimePahe (HLS, fast) as
  the automatic fallback. Trade-off: ~45 s CF-solve cold start per new title (then cached
  15 min) and a full ~400 MB MP4 (no ABR); swap back to `animepahe,allanime` for the
  faster default. The frontend server picker lists AllAnime first; Auto resolves the
  chain in this order.
  **Update 2026-06-25:** local Docker probes show AllAnime search still clears CF, but the episode/source GraphQL endpoint now returns `NEED_CAPTCHA` for One Piece and Frieren. The resolver treats that as a hard provider failure so the circuit breaker opens immediately and Auto falls through to AnimePahe instead of spending ~15s on every request. Forced AllAnime correctly degrades to embed while the breaker is open.
  **Update 2026-06-25 later:** `hianime` is registered as a forced direct-player provider without changing the Auto chain. `aniliberty` was implemented and did resolve direct HLS for Frieren ep1, but was removed from public player choices because the returned streams are Russian audio, not JP audio. HiAnime remains wired for soft-sub trials but still fails on this Indonesian network with the known `aniwatch` fetch error, so it needs a clean VPS/live probe before Auto.
  **KAA (KickAssAnime) — DONE & VERIFIED LIVE, now PRIMARY (2026-06-26).** `providers/kaa.ts`,
  host `kaa.lt` (was kickass-anime.ro / kaa.mx). This is the AllAnime-class source we wanted,
  and better: **clean/RAW video — JP audio (DEFAULT in the master) + separate soft `.vtt`
  subtitle tracks**, the ideal for our own-caption player. Pipeline: FlareSolverr mints a
  cf_clearance for kaa.lt once (cached, sliding) → `POST /api/fsearch {query}` → `GET
  /api/show/<slug>/episodes?lang=ja-JP|en-US` → `GET /api/show/<slug>/episode/ep-<n>-<slug>`
  for the `servers` list → pick the cat-player "vidstream" server → the master HLS is derived
  DIRECTLY from the server's `id` (NO decryption, unlike the legacy vidstreaming server):
  `https://hls.krussdomi.com/manifest/<id>/master.m3u8` (multi-audio, JP default). Soft subs
  come from the player page's inline `props` JSON (best-effort; our subdl/Jimaku tracks fill in
  langs KAA lacks). The krussdomi CDN is NOT Cloudflare-gated — it only needs
  `Origin/Referer: https://krussdomi.com`, injected by `/hls` + `/track`. Verified live: Frieren
  ep1 (m3u8 200, JP-default master, soft subs) and HxH ep1, both `mode:direct provider:kaa`.
  **Auto order is now `kaa,animepahe,allanime`** (`config.ts` default + local `.env`); reorder to
  `animepahe,kaa,allanime` if KAA's cold-start (FlareSolverr solve) feels slow. Reachable from an
  Indonesian residential IP; runs through the same laptop/Tailscale-funnel bridge as the rest of
  Option B (laptop must be up, else the player falls back to embed). Extraction recipe + sources:
  the npm `animob` / `consumet` KAA extractors (corrected from the dead `.ro` host to `kaa.lt`).
  **Subtitle assembly hardened (2026-06-26):** `/watch` now de-dups subtitles to one track per
  language — the provider's own (correctly timed to ITS video) wins over external
  Crunchyroll-timed tracks, which removed the duplicate / off-timing second English on KAA. The
  player got a subtitle sub-page (star/pin a language to the top, the chosen track is remembered
  as the default, captions auto-enable for no-hardsub providers like KAA), manual HLS quality
  from the master's renditions, and a mobile-PWA audit pass (≥44px tap targets, `60svh` popover,
  BCP-47 `srclang` fix so iOS native captions aren't dropped). iOS native-player caption path
  (cross-origin VTT via `/track` + `crossOrigin` on the `<video>` + `showing`-flip in native
  fullscreen) verified by code-read; still wants a real-iPhone confirmation.

  **KAA iPhone playback fix — SHIPPED (2026-06-26, PR #50).** Over the Cloudflare
  Tunnel bridge, animepahe played on iOS but KAA fell back to embed. Root cause: on
  iPhone, Safari uses the native AVPlayer (hls.js is skipped so `webkitEnterFullscreen`
  + native captions work), and KAA's stream is a **demuxed master** (separate JP/EN
  `#EXT-X-MEDIA:TYPE=AUDIO` renditions) whose MPEG-TS segments hide behind `.jpg` URLs
  that krussdomi serves as `Content-Type: image/jpeg`. hls.js ignores the MIME and
  parses the bytes (desktop/Android fine), but native AVPlayer trusts the MIME for
  alternate-audio renditions and refuses an "image" as audio. Muxed animepahe was
  unaffected (AVPlayer byte-sniffs the primary stream). Fix: the `/hls` proxy now
  sniffs the real container (MPEG-TS `0x47` sync / fMP4 box) and serves `video/mp2t`
  or `video/mp4` instead of the bogus `image/jpeg` (playlists + AES keys untouched);
  `HlsPlayer` adds an iPhone-only safety net (native error → retry once via hls.js
  before embed). Verified: KAA video+audio segments now return `video/mp2t` through
  the tunnel; tsc + eslint clean. The proxy fix is live on the laptop (no redeploy);
  on-device iOS native playback still wants a real-iPhone confirmation.
- **Phase 3 — Subtitles — BUILT & VERIFIED (2026-06-03).** Indonesian (subdl) +
  Japanese (Jimaku) external WebVTT tracks: `source-service/src/subtitles/*`
  resolves + episode-matches, downloads, unzips, converts ASS/SRT→VTT (LRU-cached,
  SSRF-guarded); `/watch` attaches tracks (resolved in parallel = no added
  latency); `/subs` serves `text/vtt` with CORS. No frontend change — the player
  already pipes `subtitles` and renders cross-origin cues. Verified live: Frieren
  ep1 → Indonesian 311 cues + Japanese 351; JJK ep5 → 368 + 335. **To activate:**
  rebuild the source-service container (`docker compose up -d --build`) so it picks
  up the new code + the keys in `.env`. Still in-browser-untested on the running
  stack (needs the rebuild). Plan revised by research (2026-06-03 — see
  [SUBTITLE-SOURCING-RESEARCH.md](SUBTITLE-SOURCING-RESEARCH.md)): **English is free**
  (the soft-sub stream bundles an English VTT — don't build a pipeline for it).
  **Japanese → Jimaku** (AniList-native API). **Indonesian → subdl** — keys now in
  hand & **verified live (2026-06-03)**: subdl serves per-episode, often
  Crunchyroll-sourced Indonesian `.ass`/`.srt` for current/popular anime (Frieren,
  JJK, Demon Slayer, Spy×Family, Mushoku Tensei, Oshi no Ko, Solo Leveling, …),
  thin-to-none for old classics. Pipeline: query `languages=ID` by title → download
  zip → unzip → ASS/SRT→VTT server-side → cache → player `subtitles` prop (works on
  the laptop today, overlaid even on AnimePahe's hardsub stream). **Keys obtained:
  Jimaku + subdl — stored in `services/source-service/.env` (gitignored).**
  OpenSubtitles deprioritized (IMDb-mapping pain + ~20 downloads/day cap).
  **UPDATE 2026-06-03 — two tracks added & VERIFIED LIVE:** (a) **Indonesian (auto)** —
  subdl's Indonesian is Crunchyroll-timed and drifts tens of seconds vs the AnimePahe
  cut (not a constant offset → not auto-correctable), so we **machine-translate the
  perfectly-timed Japanese (Jimaku) track → Indonesian** (`src/subtitles/translate.ts`,
  keyless Google gtx endpoint, batched + cached); it inherits perfect timing. Listed
  first as the default `id` pick; subdl's human "Indonesian" kept as the nicer-text
  alt. (b) **English** via subdl (`findEnglish`, `languages=EN`). Frieren ep1 now
  serves 4 tracks: Indonesian (auto) [351 cues, perfect timing], Indonesian, Japanese,
  English — all confirmed on the running container.
- **Phase 4 — UI redesign** (now prioritized FIRST — free, high-value, no source
  dependency). Rebuild watch/home/browse UI in-repo on the existing embed playback,
  using the mandatory UI/UX skills (CLAUDE.md). Player lib decided here.

### 5a. Phase-1 PoC findings (2026-06-02) — decisive

Ran from the user's own **residential** connection (not a datacenter IP):

1. **Plain `fetch` → `api.allanime.day/api` = HTTP 403 Cloudflare "Just a moment…"
   JS challenge.** (`services/source-service/scripts/probe-allanime.mjs`.)
2. **A headed, Playwright-launched Edge stays stuck on the challenge** — Cloudflare
   detects `navigator.webdriver`/automation.
   (`scripts/poc-browser.mjs`.)
3. **Even attaching to a normally-launched Edge over CDP (no automation flags) does
   NOT clear** the managed challenge on a fresh profile.
   (`scripts/poc-browser-cdp.mjs`.)

**Conclusions:**
- The blocker is **not IP reputation** (a residential IP 403s too) — so a residential
  proxy does **not** fix AllAnime. It's a **JS/bot challenge**.
- A vanilla automated browser is **detected**. Beating it reliably needs
  **FlareSolverr-grade stealth** (undetected Chromium) running **on the same box/IP**
  to mint a `cf_clearance` cookie (IP+UA-bound, ~30 min) → realistically **~2 GB RAM**.
  That is the confirmed **"heavy" cost** (~Rp100k/mo VPS, or the user's own always-on PC).
- The **embed switcher (Phase 0) sidesteps all of this for free** because it runs
  client-side in the user's real browser (inherits its challenge-solving + IP).

**DECISION:** Park Option B until there's a 2 GB box (VPS or always-on home PC running
Docker+FlareSolverr). Do **Phase 4 (UI redesign) first** on the free embed playback.
The source-service code stays in-repo, typechecking and ready to activate. To resume
Option B later: stand up Docker + FlareSolverr, then implement
`providers/allanime.ts` using the probe scripts above as the reference flow
(search → episode → decode `sourceUrl` via XOR-56 → `clock.json` → m3u8/mp4).

---

## 6. Inputs (answered)

- **Player base = this very project** (the fork). The UI redesign happens in-repo on
  the existing Next.js frontend; there is no external player to import. Player lib for
  the rebuilt watch view: **Vidstack (`@vidstack/react`) + `hls.js`** — DECIDED. It is
  React-native (our stack), HLS-capable, has built-in skip-markers/PiP/keyboard/speed/
  theater, and is what the best-reviewed competitor (Miruro) ships. See the field
  survey + gap analysis in [COMPETITIVE-ANALYSIS.md](COMPETITIVE-ANALYSIS.md). UI
  redesign work must use the mandatory UI/UX skills (see CLAUDE.md).
- **Budget:** start with a ~$5–6/mo VPS (FlareSolverr fits in 2 GB RAM). Add a
  residential/ISP proxy only if a clean VPS IP still gets challenged — usage-based,
  roughly $2–10/mo for personal scale (route only the provider API/challenge through
  it; serve video segments direct). User confirms once real costs are quoted.
- **Subtitles:** English + Indonesian are the priority; other languages optional
  long-run.

---

## 7. Skills to assist the build (from /find-skills)

- `microsoft/playwright-cli` (46.6K) — browser automation for the anti-bot layer.
- `mindrally/skills@web-scraping` (3K) — scraping patterns.
- `wshobson/agents@nextjs-app-router-patterns` (19.6K) — Next.js patterns.
- Player lib (direct dep, not a skill): **vidstack** or **artplayer** + `hls.js`.

---

## 8. Requested feature backlog (player UX + data) — from user, 2026-06-03

Phase 1 plays end-to-end now. The next rounds, in user-priority order:

**Player UX (in progress).** Replace the plain native `<video controls>` with our own
control bar — own-brand SVG icons, **no new dependency** (the repo already ships
`@vime`, `hls.js`, `@heroicons`, `framer-motion`; we hand-roll icons for a bespoke
look and to avoid lockfile churn while another session edits the home page). Scope:
configurable **skip ±5/10/15s**, **PiP**, **fullscreen**, **playback speed**, volume,
scrubber with buffered range, a **settings** menu, **keyboard hotkeys**, and a
**captions toggle** scaffold (real tracks arrive in Phase 3). Quality select + the
bidirectional embed fallback stay.

**Player UX — SHIPPED + recent additions (2026-06-03).** Custom control bar is live.
Captions render in our own layer with user styling; **caption size now scales with
the player** (clamped `cqw` units on a container-typed stage — fixed px looked tiny
on 2K/fullscreen, XL now reaches ~88px). A **subtitle track selector** (Off /
Indonesian / Japanese) and a **subtitle delay** control (±0.5s) were added — the
delay matters because external tracks are timed to their own encode and drift vs
AnimePahe's video (live example: Frieren ep1 — Jimaku JP matched exactly, subdl's
Crunchyroll Indonesian lagged ~30s on the OP). The clean fix (no drift, no burned-in
English underneath) is a soft-sub video source = HiAnime, which is VPS-gated.

**Backlog (next phases):**
1. **Watch history + Library — DONE (2026-06-03), a Tier-1 (COMPETITIVE-ANALYSIS)
   local layer; precursor to AniList OAuth sync.** Replaced the flat `Anime{id}`
   key with reactive localStorage stores `kessoku.progress.v1` +
   `kessoku.watchlist.v1` (`frontend/utility/{externalStore,progress,watchlist}.ts`
   + `useSyncExternalStore` hooks), with one-time legacy migration. Shipped:
   watched-episode indicator (auto + manual toggle) in the episode grid; Netflix-style
   landscape Continue Watching cards (progress bar, resume, remove) on home; a
   Watchlist ("My List") — bookmark on every Card + detail + watch page, a
   `/watchlist` page (status tabs), a home rail, a header nav link. **Only the direct
   player records progress** (embed iframe is cross-origin), so Continue Watching is
   sparse on the embed-only Railway deploy; watchlist + mark-watched work everywhere.
2. **Hotkey `n` → next episode** (folded into the player keyboard now). **Auto-next
   — BUILT (2026-06-04, code-complete, tsc+eslint clean; in-browser test pending):**
   an "Up next" countdown card appears in the final seconds and auto-advances when a
   next episode exists; an "Autoplay next" toggle in the player settings menu
   (persisted) gates it. Direct player only.
3. **Skip-intro/outro — BUILT (2026-06-04, code-complete; in-browser test pending).**
   AniSkip API (`frontend/utility/aniskip.ts`), keyed by `idMal` + episode (`idMal`
   added to the `AnimeInfo` fragment). `SourcePlayer` fetches markers → `HlsPlayer`
   shows a "Skip Intro / Skip Outro" button that seeks to the segment end. Tolerant of
   404 (no markers → no button). Direct player only.
4. **Indonesian subtitles — BUILT (2026-06-03).** subdl (Indonesian) + Jimaku
   (Japanese) external tracks resolved + converted to VTT in the source-service
   (`src/subtitles/*`, `/subs`), served to the already-subtitle-ready player.
   Verified live (Frieren/JJK). Coverage: good for current/popular anime, thin for
   old classics. Activate by rebuilding the source-service container. See Phase 3.
5. **Dubbed via our player — FIXED (2026-06-04, source-service rebuilt & healthy).**
   Root cause: AnimePahe silently returned the `jpn` (sub) track when a title had no
   `eng` track, so dub requests played sub audio. Now `providers/animepahe.ts` returns
   **no source** when dub is requested without a real `eng` track, so the resolver
   fails over to AllAnime (which is dub-aware at the API level via
   `availableEpisodes.dub`). Live dub playthrough still needs a browser check.
6. **/api-finder filler vs canon — DONE (2026-06-03).** `packages/api/src/filler.ts`
   scrapes animefillerlist.com → `getFillerEpisodes(title)`; a `/api/filler` route
   feeds the watch-page episode grid, which now shows colour bars (filler = amber,
   mixed = violet, anime-canon = sky; canon unmarked) with a legend that appears only
   when a title has non-canon episodes. Live-verified (Naruto 90 filler; JJK all canon).
7. **Related-anime grouping — DONE (2026-06-03).** `relations` added to the animePage
   AND watchPage queries; a `RelatedSection` rail surfaces watchable franchise entries
   (sequel/prequel/side-story/OVA/spin-off, ANIME nodes only), labelled, de-duped and
   ordered, on **both the detail page and the watch page** (below the synopsis, for
   in-series navigation without leaving the player). Manga/source relations dropped.
8. **Multi-source fallback** — AnimePahe lags new/airing titles (JJK S3/Culling Game
   not found); research + scrape more providers for a real fallback chain (Phase 2
   resilience SOP §3 circuit breaker + §1 provider chain). **Research outcome
   (2026-06-03, [STREAMING-SOURCES-RESEARCH.md](STREAMING-SOURCES-RESEARCH.md)):**
   the soft-sub goal points at **HiAnime via `aniwatch`** (only source with separate
   VTT tracks) — VPS-gated (laptop page hosts blocked). **AllAnime** stays the
   coverage/fallback pick but is hardsub, and its old XOR-56 decode is now outdated —
   the current method is **AES-256-CTR** (ani-cli, patched 2026-04). DMCA caveat:
   `aniwatch`/`consumet` upstream repos are frozen, so vendor/pin and be ready to
   patch the megacloud extractor in-house.
   **Current state (server selection):** our *direct* player resolves **AnimePahe
   only** — there is no "pick another server" for the direct path yet (AllAnime is a
   stub, HiAnime is VPS-gated). The multiple selectable servers users see are the
   **embed switcher** (Videasy/4Animo/NHDAPI), which is a separate iframe path and the
   automatic fallback. Adding real direct-server choice needs AllAnime revived and/or
   HiAnime on a VPS; until then the resolver chain is single-provider by necessity.

---

### 8a. Discovery & retention round (2026-06-04)

Free, embed-compatible Tier-1 work (COMPETITIVE-ANALYSIS §4) that helps **all** public
visitors, not just the direct player. All code-complete, tsc + eslint clean, in-browser
test pending:

- **Search autosuggest** — debounced AniList dropdown in the header
  (`frontend/hooks/useSearchSuggest.ts` + `components/SearchAutosuggest.tsx`); Enter still
  falls through to `/search`.
- **Smarter embed auto-fallback** — `EmbedPlayer.tsx` now auto-advances through servers on
  a stall (was manual-only) and remembers the working server per title
  (`kessoku.embed.byTitle`); a manual pick still wins.
- **AniList login + two-way sync** — **authorization code grant** (AniList does NOT support
  the implicit grant → `unsupported_grant_type`; token ~1yr). The browser only sees the
  `code`; a server route `pages/api/auth/anilist.ts` exchanges it for a token using the
  client **secret** (server-only env, never bundled). `utility/anilistAuth.ts` (session
  store) + `utility/anilistSync.ts` (pull-merge on login; **conservative** push — only
  advances progress / creates entries / deletes empty bookmarks, never downgrades a status)
  + `hooks/useAniListAuth.ts` / `useAniListSync.ts` + `pages/auth/callback.tsx` + a header
  avatar/login button. GraphQL ops added to `packages/api`. **To go live:** register an app
  at `anilist.co/settings/apps` (redirect `<origin>/auth/callback`) and set
  `NEXT_PUBLIC_ANILIST_CLIENT_ID` (build-time, Dockerfile `ARG`) **and** `ANILIST_CLIENT_SECRET`
  (runtime, server-only) on Railway. Two apps in use: prod id 42916, dev id 42918
  (dev id+secret in `frontend/.env.local`). The button hides until the client id is set.
  `browse` + `schedule` pages already existed. **Verified working from local (2026-06-04):
  login connects, the AniList list pulls in, watching/bookmarking pushes back.**
- **Explicit list status (2026-06-04, code-complete)** — `utility/listStatus.ts`
  (`kessoku.liststatus.v1`) + `components/anime/StatusSelect.tsx` (Watching / Plan to Watch /
  Completed / On Hold / Dropped + Remove) on the watch & detail pages, replacing the labeled
  bookmark there; the `/watchlist` tabs now filter by effective status. Explicit status maps
  1:1 onto AniList's MediaListStatus and pushes straight up; pull mirrors AniList's status
  locally. Without an explicit pick the status is still derived from progress.

### 8b. Friend-feedback round (2026-06-04, round 2) — SHIPPED via PRs #1-#5

First batch built under the new PPRM flow (CLAUDE.md §4): a branch + PR per feature, all
merged to `main`. tsc + eslint clean on the integrated tree; in-browser smoke (watch page
renders, 0 console errors) done — the fullscreen companion dock still wants a real-browser look.

- **Watch Later rail (PR #3)** — a home rail below "My List" listing PLANNING ("Plan to Watch")
  titles (`components/anime/WatchLaterRail.tsx`, mounted in `pages/home.tsx`); `WatchlistButton`
  gained an optional Watch-Later quick-save. Reuses the existing status store, hidden when empty.
- **Voice-actor + studio discovery (PR #4 + the cast-GraphQL foundation, PR #2)** — `AnimeCast`
  fragment (studios + characters + JP voice actors) on `animePage`/`watchPage`; new SDK ops
  `studioPage` / `staffPage` / `searchStudios` / `searchStaff`. The detail page shows the studio
  (→ `/studio/[id]`) and a Cast section (character + VA → `/staff/[id]`); new `/studio/[id]` and
  `/staff/[id]` grids; `search` gained Anime / Studios / Voice actors tabs (`?type=`). (AniList's
  Media query can't filter by studio/staff, hence the dedicated `Studio`/`Staff` entry points.)
- **Companion fullscreen + persistence + richer grounding (PR #5)** — see §11; the companion now
  docks on the right inside the player's fullscreen stage (toggle in the controls, video shrinks),
  per-episode chat threads persist in localStorage (capped ~10) and are shared by the rail +
  fullscreen instances, and the prompt is bounded to "you know the show up to episode N" with a
  low-spoiler cast roster seeded for sharper, less generic, still spoiler-safe takes. A
  `scripts/companion-eval` harness scores spoiler-safety / grounding / tone / specificity /
  coherence for iterating the prompt.
- **Watchlist reliability fixes (2026-06-04, branch `fix/watchlist-status`)** — three friend-test
  bugs: (a) the poster card's bookmark couldn't be clicked (the decorative play overlay covered it,
  so the tap navigated to the title instead); (b) "Plan to Watch" didn't stick; (c) removed titles
  came back after a refresh. (b)+(c) shared a root cause: the AniList pull re-applied remote state
  over newer local intent, and its delete/baseline state was in-memory (lost on refresh), so it
  only deleted progress-less entries. Fix: a **persisted intent layer** (`kessoku.anilist.sync.v1`)
  — tombstones (locally-removed titles are force-deleted on AniList and never resurrected by a
  pull) + dirty-status flags (a local status change wins over the remote one until it is pushed),
  both cleared **only on a confirmed AniList write**; a failed pull or push is a no-op that retries
  on the next sync. `pointer-events-none` on the card play overlay fixes the click-through. tsc +
  eslint clean; the card fix is browser-verified, the AniList round-trip needs a logged-in check.
- **Landing page that sells the flagship features (2026-06-04, branch `feat/landing-sell`)** — the
  old splash only advertised "no pop-ups + browse + schedule". Rebuilt the middle of
  `pages/index.tsx` into four alternating feature blocks with bespoke, on-brand mockups:
  **AI companion** (an interactive chat demo whose tone chips swap the reply live), **AniList sync +
  Watch Later** (a synced list-entry card showing a real Frieren cover pulled in the splash query),
  **custom player** (skip-intro / auto-next / captions / quality control bar), and **filler vs
  canon** (the colored episode grid). Plus a lighter "the rest of the setlist" strip (schedule,
  one-click server switch, VA/studio discovery, PWA) and refreshed hero + chips + CTA copy. The
  companion's in-player tone labels were renamed to the friendlier marketing set (Adaptive /
  Thoughtful / Hyped / Soft / Off the rails) so the picker matches the landing; the API `id` values
  are unchanged. Brand-voiced (no AI-slop, no em dashes), Midnight-Aurora tokens, no design bans;
  tsc + eslint clean, verified at desktop + mobile. **Honest caveat:** on the public embed-only
  Railway deploy the companion needs `COMPANION_API_KEY` set to be live, and the per-scene player
  features are fullest on the direct/source-service player.

### 8c. Player-first fix (2026-06-12, code-complete, not yet merged)

- **SourcePlayer superseded-resolve race** — opening an episode fired `resolve()`, then the
  saved server pref (`kessoku.source.provider`) hydrated from localStorage and re-ran the
  effect; the aborted first fetch's `.catch` set `phase='embed'`, stomping the new attempt's
  `'loading'`. The page looked like it instantly gave up on our server and needed a manual
  "↺ Try our server" click on every open. A superseded attempt is now silent (only real
  failures and the 90s timeout fall back to embed), so the direct pipeline is genuinely
  attempted first. (`frontend/components/watch/SourcePlayer.tsx`)
- **AniList deleted-entry resurrection** — deleting a title on the AniList *site* didn't
  remove the local copy, so the next push saw "local progress AniList doesn't have" and
  re-created the entry (CURRENT/COMPLETED). `anilistSync.ts` now persists `seenRemote`
  (ids present at the last complete pull) in `kessoku.anilist.sync.v1`; an id missing from
  a later complete pull is mirrored as a local removal (watchlist + progress + status).
  Local intent still wins (dirty / tombstoned ids exempt), and a chunked (`hasNextChunk`)
  pull never reconciles, so a partial response can't read as mass deletion. Companion
  model also bumped to `gemini-3.5-flash` (env-only; Railway `COMPANION_MODEL` updated).
- **Un-marking episodes didn't move the resume pointer** — `unmarkWatched()` only edited
  the `watched[]` array; `ep`/`sec` (what "continue where you left off" reads) stayed
  parked, so a background autoplay that marched to ep 11 still resumed at ep 11 after the
  user un-marked eps 2-11. The pointer now pulls back to just after the highest episode
  still marked (never forward; in-episode position kept when unaffected), and an entry
  left with no marks and no position drops off the Continue Watching rail entirely.
  (`frontend/utility/progress.ts`)
- **"Unwatch from here" rewind (context menu)** — right-click / long-press on an episode
  tile now opens a small menu (Midnight-Aurora tokens, viewport-clamped, Escape/outside
  dismiss) with the single-episode mark toggle plus an explicit rewind: `unwatchFrom()`
  clears marks from ep N onward and restarts the pointer at N, and `noteProgressRewind()`
  records the one case a push may LOWER AniList progress (normal pushes stay advance-only;
  an explicit COMPLETED downgrades to CURRENT since AniList force-bumps completed entries).
  Pulls skip the watched-backfill for a pending rewind so stale remote progress can't
  re-mark the cleared episodes — previously a mid-series unmark silently came back on the
  next session for logged-in users. (`Episode.tsx`, `progress.ts`, `anilistSync.ts`;
  designed with the `impeccable` skill, product register)

## 9. Local host runbook (laptop) + VPS migration off-ramp

The Option B stack runs via Docker Compose in `services/source-service/`
(`docker compose up -d --build`): `kessoku-flaresolverr` + `kessoku-source-service`,
published on **:8088** (host :8080 is the user's Apache). Both use
`restart: unless-stopped`, so they auto-start on boot / Docker launch and survive
laptop sleep — that is what stops the service dying on idle. Requirements: Docker
Desktop running, **WARP OFF** (it changes the egress IP and breaks DDoS-Guard). The
frontend reaches it via `NEXT_PUBLIC_SOURCE_SERVICE_URL=http://localhost:8088`
(gitignored `.env.local`); unset that (e.g. production) and the player stays embed-only.

**Moving to a VPS later — turn OFF the laptop auto-start** (so the two don't run in
parallel):
1. Laptop, from `services/source-service/`: `docker compose down` (stops + removes the
   containers; removed containers are not revived by `unless-stopped` on reboot).
2. Optional: disable Docker Desktop "Start when you log in" if you don't want Docker
   booting at all.
3. VPS: run the same `docker compose up -d --build` (there `unless-stopped` is correct,
   always-on).
4. Repoint the frontend `NEXT_PUBLIC_SOURCE_SERVICE_URL` from `localhost:8088` to the
   VPS URL.

---

## 10. Idea parking lot — AI companion & social co-watch (exploratory, NOT committed)

Captured from a user brainstorm (2026-06-03). These are product-direction ideas to
weigh later, **not** scheduled work and **not** greenlit. Status for all of them:
**idea / research**. The point of writing them down is so we record honest feasibility
before any of it earns a phase number.

**A. AI recommendation chatbot.**
- Pitch: chat "what should I watch" and get AniList-grounded recommendations.
- Open question the user raised himself: is it overkill for a streaming site? A plain
  "because you watched X" rail likely delivers most of the value for a fraction of the
  work. Park unless it can beat the simpler non-chat version on something concrete.

**B. AI watch companion (the standout idea — both people in the chat lit up at it).**
- **Promoted to a concrete design spec — see §11 below.** Short version: an AI persona you chat
  with *while the episode plays*, in the Kessoku-Band voice, grounded on the AniList synopsis +
  the subtitle track + the current timestamp (no frame-level video understanding needed). §11
  records the three design pillars (per-episode knowledge seed, anti-spoiler subtitle window,
  selectable tone), the architecture, and the build gate. The model + hosting research it builds
  on stays in D/E below.

**C. Watch together (synced co-watch rooms). → Promoted to §12 (user request, 2026-06-05).**
- Pitch: a shared room where friends watch in sync (play / pause / seek propagated)
  with a side chat. The companion from (B) could optionally sit in the room too.
- Cost shape: needs a realtime layer (websockets, or a managed pub-sub) plus
  playback-sync logic. Doable, but it is its own build — sequence it after the core
  player and sources are solid, not before.
- **Update 2026-06-05:** the user explicitly asked for this ("kek teleparty, dua atau lebih
  user nonton di server yang sama, klo satu pause semuanya ke pause"). The concrete design,
  hard parts, and phasing now live in **§12** below.

**D. Self-hosting the LLM (the shared enabler for A–C).**
- Source of the idea (now confirmed): **Odysseus** by `pewdiepie-archdaemon` — repo
  <https://github.com/pewdiepie-archdaemon/odysseus>, site
  <https://pewdiepie-archdaemon.github.io/odysseus/>. **MIT-licensed**, self-hosted,
  billed as "the self-hosted version of the UI experience you get from ChatGPT and Claude."
- What it actually is: a **model-agnostic AI workspace, not a model.** It is the
  orchestration / UI layer — chat, autonomous agents with tools (bash / files / web /
  memory), MCP integration, persistent memory (ChromaDB), deep research, model
  comparison, and a "Cookbook" that scans your hardware and recommends/serves models
  (270+ catalogued). It connects to whatever backend you point it at: **local**
  (llama.cpp / Ollama / vLLM) **or remote** (OpenAI / OpenRouter). Deploys exactly like
  our source-service — `docker compose up -d --build`, web UI on `:7000`.
- Why that matters for us: it fits *both* hosting paths below, and the Docker pattern is
  one we already run. But it is a **general ChatGPT-style workspace, not an embeddable
  in-player companion** — so for feature B we would either run it standalone as a
  self-hosted assistant, or reuse only its model-serving layer and build our own
  companion UI. It is not a drop-in widget.
- **Key correction — for the web app you do NOT integrate *through* Odysseus.** Odysseus
  is a human-facing UI; our app needs a *model endpoint*, not another UI. The clean wiring
  reuses the same engine Odysseus itself drives (Ollama / llama.cpp), run on its own and
  called directly:

  ```
  [ Ollama on the box ]  → OpenAI-compatible HTTP API (/v1/chat/completions)
            │
            ▼
  [ Next.js /api/companion route ]  → grounds the prompt on synopsis + subtitle window
            │
            ▼
  [ in-player companion chat ]
  ```

  Ollama exposes that API the moment it runs. Our Next.js server route calls it exactly
  like the existing `/api/filler` / `/api/subs` routes. Odysseus stays optional — useful
  as a *human* console to trial models, irrelevant to the app's data path. Crucially the
  endpoint is **OpenAI-compatible either way**, so a hosted free API today and a local
  Ollama later are the *same* integration with a different base URL — swap, don't rewrite.
- **Hardware reality (this is the real gate, not the code).** Approx, Q4-quantized:

  | Model | Needs | Verdict for a companion |
  |---|---|---|
  | Llama 3.2 **1B** | ~2–3 GB RAM, CPU ok | runs cheap, too dumb to banter well |
  | Llama 3.2 **3B** | ~4–5 GB RAM, CPU slow | borderline; sluggish replies |
  | Qwen2.5 **7B** / Llama 3.1 **8B** | ~6–8 GB RAM **or ~6 GB VRAM** | the "actually fun to talk to" tier — wants a GPU for real-time |

  The current ~2 GB Option B box runs **none** of these usefully. A GPU box that does is a
  different cost tier (tens-to-hundreds $/mo always-on), not the $5–6/mo source VPS. So:
    1. **Hosted free-tier API now** — no GPU, working today, rate-limited (see E).
    2. **Local Ollama on a GPU box later** — real ownership, materially more cost.
  Same endpoint shape both times. Decide A–C's value *first*; hosting follows that.

**E. Which free model, and how it plugs in — for *our* context (verified 2026-06-03).**
The companion needs: casual banter / persona, **Indonesian + English** (target users chat
in Indo), strong instruction-following to stay grounded on the synopsis + subtitle window,
and low enough latency to feel alive mid-episode. Against that, the free tiers ranked:

- **Default pick — Google Gemini 2.0 Flash (AI Studio free).** Best **multilingual**
  (strong Indonesian, so the persona actually banters in the users' language) and a
  **1M-token context** — we can drop the *whole* episode's subtitle VTT + synopsis + tags
  in as grounding with no chunking. Free tier ~**1,500 requests/day, 15 RPM** (plenty for
  personal scale; Google trimmed free limits ~50–80% in late 2025, but 15 RPM is fine for
  one viewer chatting). Prototype on this. **Update 2026-06-04:** on a fresh AI Studio key the
  `gemini-2.0-flash` free tier came back `limit: 0`, so the build defaults to the model name
  **`gemini-2.5-flash`** (same family, free quota live; `-lite` and `gemini-flash-latest` also work).
- **Speed pick — Groq + Llama 3.3 70B.** ~**300+ tokens/sec**, replies feel instant — the
  best "talking while watching" feel. Limits ~**30 RPM / 1,000 req/day / 6,000 TPM**.
  Catch: the 6k tokens/min cap means **don't** stuff the full subtitle file each turn —
  feed a **rolling window** of recent lines. Indonesian is okay (weaker than Gemini). Keep
  it wired as the low-latency alternate.
- **Flexibility pick — OpenRouter (one OpenAI-compatible key).** ~28 free models (DeepSeek
  R1, Llama 3.3 70B, Qwen3, Gemma 3, even Gemini 2.0 Flash free) behind a single endpoint,
  so we can A/B which persona *feels* best without rewiring. Limits **20 RPM, 50 req/day**
  free → **1,000/day after a one-time $10** (never expires). This is also the exact
  endpoint shape we'd later point at local Ollama.

**Recommendation:** prototype the companion on **Gemini 2.0 Flash free** (multilingual +
huge context = least friction for subtitle grounding); keep **Groq / Llama-3.3-70B** wired
as the low-latency alternate; only consider local Ollama once B proves it earns the GPU
bill. Brand note: UI chrome stays English (CLAUDE.md), but the *companion's speech* is
conversational content like subtitles — bilingual / Indonesian for these users is the
likely call; confirm when B becomes real.

**Suggested first step if we ever pursue this:** prototype **B** as a thin text companion
grounded on synopsis + subtitles, on **Gemini 2.0 Flash free** behind a Next.js
`/api/companion` route, before spending anything on self-hosting or realtime co-watch.
Prove people want to talk to it before we pay to run it.

> Sources for the free-tier figures (verified 2026-06-03): [TokenMix — free LLM APIs](https://tokenmix.ai/blog/free-llm-apis-2026-every-provider-free-tier-tested),
> [costbench — best free-tier API](https://costbench.com/best/best-llm-api-with-free-tier/),
> [costgoat — OpenRouter free models](https://costgoat.com/pricing/openrouter-free-models),
> [OpenRouter free-models collection](https://openrouter.ai/collections/free-models).

---

## 11. AI watch companion — BUILT 2026-06-04 (live chat pending an API key)

Promoted from the §10-B brainstorm on a user request, then built the same day. **Status: shipped,
code-complete, tsc + eslint clean, UI + route + anti-spoiler wiring verified in a real browser.
The one thing left is a free API key** — drop a Gemini key into `COMPANION_API_KEY` and restart,
and the setup note becomes the live companion. The design below is what it was built to; the
"Shipped" list records the actual files.

**Round-2 upgrades shipped 2026-06-04 (PR #5, see §8b):** a fullscreen "theater" dock (chat on the
right inside the fullscreen stage, video shrinks), per-episode chat threads persisted in
localStorage (capped ~10, shared by the rail + fullscreen instances), a low-spoiler cast roster +
"you know the show up to episode N" prompt bounding for sharper, still spoiler-safe replies, and a
`scripts/companion-eval` harness for iterating the prompt. Switched the default model to
`gemini-2.5-flash` (the 2.0-flash free tier is zeroed for new keys).

**Round-2.5 companion fixes shipped 2026-06-04 (branch `fix/companion-ux`):** chat turns now stamp
the episode timestamp they were sent at ("at 12:34"); the fullscreen dock uses the full canvas
height (was capped to ~half); and the **unhinged** tone got a forceful tone-override plus per-tone
model routing — when the viewer opts in (18+), unhinged requests route to an optional uncensored
OpenRouter model (`COMPANION_UNCENSORED_*` env), falling back to the default provider if that free
pool 429s, so it always replies. Active default provider is now **Groq**
(`llama-3.3-70b-versatile`, free + fast); Gemini stays a base+model env swap.

**Round-3 spoiler / hallucination hardening shipped 2026-06-05 (the "ep-9 incident").** A friend
watching *Class de 2-banme ni Kawaii Onnanoko to Tomodachi ni Natta* (English: *I Made Friends with
the Second Prettiest Girl in My Class*) episode 9 reported the companion **spoiled** him. We
researched the actual show (Wikipedia + the Kuranika Fandom + the Moe Sucks ep-6 and Fandom Post
ep-9 reviews) to check. Verdict: it did **not** leak future canon — it **confabulated**, and stated
the made-up details with full confidence. It invented a cold/scary father "Sora Asanagi" for Umi, a
stern silent father "Masaki Maehara" for Maki, a non-existent younger brother "Itsuki" who'd "been
there since episode 1", a "naggy" mother, and a wrong reason ("feels unpopular") for skipping the
Christmas party. Ground truth: Umi's father is **Daichi Asanagi** (warm, friendly); "Sora" and
"Masaki" are the **mothers**; "Itsuki Maehara" is Maki's estranged **father**, not a brother (he
first appears ~ep 6–7); and Maki is **male**. The real family arc *is* on-screen by ep 8–9, so the
broad topic was fair game — but every specific (name, role, gender, motive) was fabricated.

The lesson, and the design correction: **to the viewer a confident invented detail is
indistinguishable from a spoiler.** Naming a relationship they have not seen reads as "you just told
me something the show hasn't" whether the detail is real-but-future or pure invention. So spoiler
safety is not only about the subtitle window's hard bound (which held — the model never received
future lines); it is also about the model refusing to *guess* off-window. Three changes
(`frontend/pages/api/companion.ts`, `scripts/companion-eval/{fixtures.json,eval.mjs}`):

1. **Prompt.** The hard rules now (a) extend "treat past the edge as unknown" to cover *who people
   are and how they are related*, not just future plot; (b) state plainly that the cast list is
   names + a generic role label + a voice actor and **nothing about relationships, personality, or
   backstory**; (c) forbid stating or guessing any name / family tie / personality / motive that is
   not in the already-shown lines, and forbid agreeing with a guess the viewer floats unless the
   screen backs it; (d) tell it to answer "honestly I don't think we've actually been shown that
   yet" and describe unknown characters by what just happened ("the guy at the door") instead of
   inventing a name. The old "name the character who just spoke" line — which pushed it to always
   produce a name — was softened to "when you actually know who that was."
2. **Temperature.** Default-provider sampling dropped **0.85 → 0.6**. The companion's warmth lives
   in the prompt; the extra heat mostly bought confident confabulation.
3. **Eval.** New `classroom-confab-trap-ep9` fixture replays the exact failure on a *fake* show
   (so any answer is measurable): Indonesian probes for an unseen parent's name, a non-existent
   younger sibling, a mother's personality, and a motive, plus one *answerable* turn where the aired
   line gives the real reason so the model is scored on grounding to it rather than to the viewer's
   wrong guess. The judge rubric now scores an honest "haven't been shown that yet" **high**, not as
   a specificity penalty. *Verified statically (tsc + next lint clean, fixtures parse); the live
   behavioural lift still needs a run of `scripts/companion-eval` with a key, or an in-app chat.*

**Future — "upscale the unhinged AI" (Option A, parked 2026-06-04).** The `:free` uncensored model
(Dolphin Venice via OpenRouter) is a *shared* pool that rate-limits (429, `is_byok:false`), so today
unhinged usually lands on the Groq fallback (edgy but safety-aligned, won't go fully explicit). When
we want it genuinely uncensored and reliable, point `COMPANION_UNCENSORED_MODEL` at a cheap **paid**
OpenRouter model + a one-time ~$5 top-up: `thedrummer/rocinante-12b` ($0.17/$0.43 per M tok,
~$0.0005/chat) is the value pick, `thedrummer/cydonia-24b-v4.1` the bigger 24B, `sao10k/l3.3-euryale-70b`
the premium 70B. Alt path: BYOK a Venice key under OpenRouter Integrations to keep the `:free` slug.
Parked for now — the Groq fallback is "lumayan cukup."

Why it earns the work: people who watch niche titles have nobody around to talk to about them. An
always-there persona that can talk about *this* episode, in the Kessoku-Band voice, is real
differentiation, not a checkbox.

**Shipped (2026-06-04):**
- `frontend/pages/api/companion.ts` — OpenAI-compatible chat route (GET status + POST), server-only
  key, persona + tone prompts, anti-spoiler prompt guard. Returns 503 `companion_unconfigured`
  when no key is set so the panel degrades to a friendly setup note.
- `frontend/components/watch/CompanionChat.tsx` — the in-player chat panel (tone picker with the
  18+ gate on "unhinged", message list, composer, setup state).
- `frontend/utility/companionContext.ts` — the player→panel bridge that yields the spoiler-safe
  window; `frontend/utility/companionPrefs.ts` — the tone + mature store.
- `frontend/components/watch/HlsPlayer.tsx` — registers the aired-subtitle getter (cue scan bounded
  by `currentTime`) and keeps a grounding track parsed; `frontend/pages/watch/[id].tsx` — mounts the
  companion as a "Companion" tab beside Recommended in the right rail.
- Env: `COMPANION_API_KEY` / `COMPANION_API_BASE` / `COMPANION_MODEL` (server-only, no Dockerfile
  ARG needed); documented in `frontend/.env.example`. Default model = free **Gemini 2.5 Flash**.
  Gotcha found live (2026-06-04): `gemini-2.0-flash` free tier is now **zeroed** for new keys
  (429 RESOURCE_EXHAUSTED, `limit: 0`); `gemini-2.5-flash` (and `-lite`, `gemini-flash-latest`)
  still carry free quota, so the default moved to 2.5-flash. Verified a real reply end-to-end
  against the live key. Groq is a base+model env swap.
- Reality on the deployed (embed-only) site: the panel still shows and grounds on synopsis +
  "up to episode N"; the per-moment **subtitle** window is direct-player only (the embed iframe is
  cross-origin), so scene-level spoiler-safety is best on the direct player.

### 11a. Three design pillars

**1. Knowledge seed (once per episode).** At session start the system prompt is seeded with what
the companion knows about the show overall: title (romaji + english), synopsis
(`anime.description`, HTML stripped), genres + tags, format, and "episode N of M". Every field is
already on the watch-page props (`watchPage` → `AnimeInfo`), so no new fetch — thread it through
the same props the player already receives.

**2. Anti-spoiler progressive subtitle window (the core constraint).** The companion may only ever
see dialogue that has **already played**. It must be able to answer "wait, who is that again?"
about the last scene without ever hinting at what comes next.

- *Mechanism (reuses code that already exists).* The player already parses the whole episode VTT
  into an in-memory cue list and scans it every frame to render the active line (`HlsPlayer.tsx`,
  the `t.cues` loop around L631-L646). The window is a second pass over that same list: collect
  every cue with `startTime <= currentTime`, take a rolling tail of the most recent lines, and
  **never** include a cue with `startTime > currentTime`.
- *Two-layer guard.* (a) Data bound — future cues never leave the browser, so the model
  physically cannot receive them. (b) Prompt guard — the system prompt states the companion only
  knows up to the current moment and must never foreshadow or reveal unaired events. The data
  bound is the real protection; the prompt guard covers the model inferring ahead from the
  synopsis.
- *Sizing.* Scale the window to the model's budget: Groq's ~6k tokens/min cap → a tail of recent
  lines only; Gemini's 1M context → can carry every aired cue plus the synopsis with no chunking.

**3. Selectable persona / tone.** A base Kessoku-Band voice (a brand-copywriter job when built)
with a tone preset the viewer picks and can switch mid-episode, persisted in localStorage like the
existing `autoNext` player pref. The presets the user asked for:

| Tone | Behaviour | Note |
|---|---|---|
| Analytical | thematic / character "deep" reads, restrained | |
| Hype buddy | jokes, reactions, high energy | |
| Melancholic | soft, emotional, sits in the feels | |
| Unhinged ("Bad Rudy") | vulgar / explicit / edgy | behind an explicit maturity opt-in; provider-ToS + safety caveat (Groq / Gemini free tiers may filter this; an uncensored OpenRouter model may be required) |
| Adaptive | mirrors the viewer's own tone and energy | |

Each preset is a system-prompt fragment layered on the base voice + the episode seed; the
anti-spoiler rule applies to all of them.

### 11b. Architecture (reuses existing patterns)

```
[ LLM endpoint ]  → OpenAI-compatible (Gemini free now / Groq alt / local Ollama later)
          │
          ▼
[ Next.js /api/companion route ]  → server-only key; builds the prompt from
          │                          seed + anti-spoiler window + tone + chat history
          ▼
[ in-player chat panel ]  → direct player only; absent on embed
```

- **Route.** New `frontend/pages/api/companion.ts` (POST), modeled on `/api/auth/anilist.ts`
  (server-only secret, never bundled) and `/api/filler.ts` (request / cache shape). Holds
  `GEMINI_API_KEY` / `GROQ_API_KEY` server-side. The endpoint is OpenAI-compatible, so "hosted
  free tier now, local Ollama later" is a base-URL swap, not a rewrite (per §10 D/E).
- **Contract.** Request `{ animeId, episode, total, tone, seed:{ title, synopsis, genres, tags,
  format }, window:[ aired lines ], messages:[ chat history ], message }` → response `{ reply }`
  (token streaming is a later polish, not the MVP).
- **Client panel.** On the watch page, desktop = a "Chat" tab beside Recommended in the existing
  `watch/[id].tsx` `lg:grid-cols-[minmax(0,1fr)_360px]` sidebar (or a right drawer); mobile = a
  bottom drawer / accordion below the player. Use the design tokens already in the watch UI
  (`bg-canvas-2`, `border-line/60`, `rounded-2xl`, `bg-aurora` send button, `text-fg/muted/faint`)
  and reuse the existing overlay patterns (`AniListBenefitsModal.tsx`, the HlsPlayer settings
  popover). Hidden / disabled whenever the player is on the embed fallback.
- **Window plumbing.** Build the aired-cue window inside HlsPlayer from the same cue scan that is
  already there; surface `currentTime` + the window to the panel via a callback or the existing
  `store.timer.currentTime` Redux value.

### 11c. Phasing + gate

- **Foundation (mostly already shipped):** direct player as the default path, the VTT subtitle
  pipeline, and `idMal` + metadata on the watch props. **Remaining gate:** the §10 D/E
  model-hosting decision, and the player / sources being stable enough that the companion is not
  competing with breakage.
- **Build order when greenlit:** (1) thin text MVP — one tone, Gemini free, no streaming; (2) add
  the knowledge seed + anti-spoiler window; (3) persona presets + switcher; (4) polish — streaming
  replies, panel UX, per-episode history; (5) optional co-watch (§10-C) much later, as its own
  build.
- **Cost gate (unchanged from §10):** prove people actually want to talk to it on the free tier
  before paying for an always-on GPU box.

### 11d. Open decisions (settle at build time)

- Companion *speech* language: bilingual / Indonesian (likely, since it is conversational content
  like subtitles) vs English. UI chrome stays English per CLAUDE.md.
- Default model: Gemini 2.0 Flash free (multilingual + 1M context) vs Groq for speed — §10
  recommends starting on Gemini.
- "Bad Rudy" content gating, and which provider tolerates explicit output under its ToS.
- Panel placement (sidebar tab vs drawer) and whether chat history persists per episode.
- Free-tier rate-limit / cost guardrails.

> Skills for the build (not this round): persona / tone copy = `/brand-copywriter` + `/brand` +
> `/stop-slop`; the chat-panel UI = `/impeccable` + `/ui-ux-pro-max` + `/frontend-design`.

---

## 12. Watch together (Teleparty-style synced co-watch) — REQUESTED 2026-06-05, not yet built

Promoted from the §10-C parking lot on a direct user request: *"bikin fitur biar bisa kek teleparty,
dua atau lebih user berbeda nonton di server yang sama, klo satu pause semuanya ke pause."* So the
target is a shared room where two or more people watch the **same episode in lock-step**: anyone
hits pause and it pauses for everyone, anyone seeks and everyone follows, with a side chat to talk
while it plays. **Status: requested / design — not greenlit, not scheduled.** Sequence it *after* the
core player and sources are stable (it is its own build, same call as §11c step 5).

### 12a. The one hard constraint that shapes everything: which player

We have two playback paths, and they behave oppositely for sync:

- **Direct custom player (`HlsPlayer.tsx`)** — same-origin `<video>`, so JS can read and set
  `currentTime`, `play()`, `pause()`. **Sync is possible here.** This is the only path co-watch can
  actually drive, exactly like the companion's subtitle window (§11a-2): both features need a player
  we control, and both are direct-player-only.
- **Third-party embed iframe (`EmbedPlayer.tsx`)** — cross-origin. We **cannot** read or set the
  embed's playback position from our page (browser same-origin policy), and most embed hosts expose
  no postMessage control API. **Sync is effectively impossible on embeds.** Best we could do is sync
  a *"start now"* countdown and trust everyone's local timer drift, which falls apart on the first
  pause. So co-watch ships as a **direct-player-only** feature; in an embed room the UI should say so
  rather than pretend to sync.

Knock-on: today the direct player is served by the laptop source-service over Tailscale Funnel
(up only when the laptop is on — see the share-testing memo). A watch party therefore inherits the
same availability gate as solo direct-player watching: the source has to be reachable. Moving the
source-service to an always-on VPS (§4 / §9 off-ramp) is what makes co-watch dependable, not a code
change.

### 12b. The realtime layer (the new infra this needs)

Co-watch needs a **persistent bidirectional channel** between participants — something Next.js API
routes on Railway do not give us (they are serverless, no long-lived sockets). Options, cheapest
first:

- **Managed pub/sub (recommended MVP):** Ably / Pusher / Supabase Realtime — all have a free tier
  that covers friends-scale rooms, give presence + channels out of the box, and need **zero servers
  to run**. Fastest path to a working room; revisit only if cost/scale ever bites.
- **Our own WebSocket service:** a tiny `ws` (Node) or a Cloudflare Durable Object room server,
  co-located with the source-service on the laptop/VPS box we already run. More control, no
  third-party, but it is another always-on process to babysit. Pick this only if a managed tier's
  limits or ToS get in the way.

Either way the app stays provider-agnostic behind a thin client hook, the same posture as
`/api/companion` being OpenAI-compatible: swap the realtime backend without touching the UI.

### 12c. Sync model — symmetric control, drift-corrected

The user's spec is **democratic, not host-only**: *anyone* pausing pauses *everyone*. Model the room
as a small shared state and reconcile against it:

```
RoomState = { videoId, episode, paused: bool, positionSec, updatedAt, lastActorId }
```

- **Emit on intent, not on tick.** When a participant play/pause/seeks, broadcast
  `{ type, positionSec, at }`. Do not stream `timeupdate` every frame (that is a feedback storm).
- **Apply + drift-correct on receive.** On an incoming event, set paused state and, if
  `|localTime - positionSec| > ~0.75s`, seek to match. A small tolerance stops constant micro-seeks
  from network jitter.
- **Loop guard.** Setting `currentTime`/`pause()` programmatically fires the same `seek`/`pause`
  events locally — tag the player's own outbound events so an applied remote change does not echo
  back out and ping-pong the room.
- **Late join / heartbeat.** A joiner pulls the latest `RoomState` and seeks to
  `positionSec + (now - updatedAt)` if playing. A low-frequency heartbeat (every few seconds)
  re-anchors slow drift without the per-frame chatter.
- **Buffering reality:** if one viewer stalls on a slow segment, decide the rule — soft (everyone
  keeps going, the slow one catches up on the next event) is simpler than hard (a stall pauses the
  room). MVP = soft; "wait for everyone" is a later toggle.

### 12d. Rooms, identity, and the side chat

- **Room = shareable code/link** (`/watch/[id]?room=ABCD` or a dedicated `/party/[code]`). Creating
  a room from the watch page gives a copyable invite; opening the link joins.
- **Identity:** AniList login already exists, so signed-in users get their handle/avatar for free;
  friends without an account get a lightweight nickname prompt (no account wall — these are casual
  friend sessions, per the share-testing memo). Presence shows who is in the room and who is
  buffering.
- **Side chat:** reuse the `CompanionChat` UI patterns (message list + composer, the same tokens) for
  a human room chat. **Optional: the AI companion (§11) can sit in the room** — a shared persona
  reacting alongside everyone, still bounded by the same spoiler-safe window (now the *slowest*
  viewer's position, so it never gets ahead of anyone). That is the natural fusion of §11 + §12.

### 12e. Phasing

1. **MVP:** direct-player rooms, managed pub/sub, two-person symmetric play/pause/seek sync + a join
   link. Prove two laptops stay in lock-step before adding anything.
2. **Presence + side chat** (who's here, buffering state, human chat).
3. **Companion-in-room** (the §11 persona shared, window pinned to the slowest viewer).
4. **Robustness:** late-join re-anchor, buffering policy toggle, reconnect, embed rooms degrade to a
   "start together" countdown with an honest "no auto-sync on embeds" notice.

### 12f. Open decisions (settle at build time)

- Realtime backend: managed (Ably/Pusher/Supabase) vs our own `ws`/Durable Object box.
- Control policy: pure symmetric (anyone controls) vs an optional "host lock" for bigger rooms.
- Buffering policy: soft catch-up vs hard "wait for everyone."
- Identity floor: AniList-only vs anonymous nicknames allowed (likely allow nicknames for friends).
- Availability: does this wait on the source-service moving to an always-on VPS (§4/§9)? Co-watch is
  only as dependable as the direct player it drives.

> Skills for the build (not this round): realtime / sync is backend — no UI skill gate; the room +
> chat UI = `/impeccable` + `/ui-ux-pro-max` + `/frontend-design`; any room copy = `/brand-copywriter`
> + `/brand` + `/stop-slop`.

---

## 13. Scalability — what scales, what walls first, in what order (2026-06-15)

The app today is built for personal / friends scale. This is the honest map of where it stops
scaling, the order the walls bite, and what is now guarded. Checked against the code, not guessed.

### What already scales (no work needed)
- **Frontend (Next.js on Railway):** stateless → just add replicas. User data is localStorage +
  AniList, so there is **no per-user server state and no app DB** to scale.
- **Embed playback:** runs in the viewer's own browser (their IP + their bandwidth), so it is
  effectively free and unbounded. This is exactly why embed stays the public default.

### The walls, in the order they bite
1. **Direct-video bandwidth (hardest).** Every byte is proxied through ONE box: `fileProxy.ts`
   streams the whole ~400 MB AllAnime MP4 per viewer; `hlsProxy.ts` buffers + re-serves every
   AnimePahe segment. A handful of concurrent direct viewers saturate a home/VPS uplink. Levers,
   cheap→dear: (a) CDN (Cloudflare) in front so repeat segments are edge-cached — **prep shipped
   2026-06-15:** `/hls` segments + `/file` now send `Cache-Control` so an edge (and the browser)
   can cache them; (b) prefer ABR-HLS over the full-MP4 path; (c) only proxy the genuinely
   Referer-gated bytes and let the rest hit the CDN directly (**NOT done** — must be verified per
   source on the live stack, since AnimePahe/kwik segments ARE referer-locked; tracked here);
   (d) proxy pool when bans rise.
2. **AI companion cost / rate — GUARDED 2026-06-15 (Rule 8).** Free tiers are shared across all
   users (Gemini ~15 RPM·1500/day, Groq ~30 RPM·1000/day) and one chat turn fans out to ~2 upstream
   calls. `frontend/pages/api/companion.ts` now gates on a tiered in-memory limiter
   (`frontend/utility/companion/rateLimit.ts`): **per-IP** burst+RPM, a **global** RPM cap, and a
   **daily budget ceiling** — returns `429` + `Retry-After`, the panel degrades to a friendly
   "quota for now" line, and the limiter **fails open** if it errors (a guard bug never takes the
   companion down). Single-instance process memory is the store; **Redis is the multi-replica
   upgrade** (same call sites). Tunable via `COMPANION_IP_*` / `COMPANION_GLOBAL_*` /
   `COMPANION_DAILY_MAX` (see `frontend/.env.example`).
3. **Provider scraping fragility.** One IP scraping providers → more users = faster CF/DDoS-Guard
   bans + more DMCA visibility. **Guarded 2026-06-15:** `/watch` (the only scrape + FlareSolverr
   fan-out) is now rate-limited with a **global** token bucket
   (`services/source-service/src/rateLimit.ts`) — global, not per-IP, because the box sits behind a
   tunnel with no reliable per-client IP and `X-Forwarded-For` is spoofable, so a per-IP cap would
   either false-throttle everyone or be bypassed. `/hls`, `/file`, `/subs` are deliberately **left
   unthrottled** (high-frequency proxy/cache — throttling them would stutter video). Source +
   subtitle caches (15 min / 24 h) already absorb repeats; a proxy pool is the costly next lever.
4. **Realtime co-watch (§12, unbuilt).** Managed pub/sub (Ably/Pusher free) scales to friend-rooms
   with zero ops; only a self-hosted ws server would itself need scaling.
5. **AniList as a shared dependency.** SSR proxying hits AniList's per-IP ~90/min; cache hot queries
   (trending / schedule) and use each user's own token for their list ops (already does). Mostly fine.

### Cross-cutting precondition
The source-service must move off the laptop to an **always-on VPS** (§4 / §9) before direct playback
OR co-watch is dependable at any real scale. This is operational, not a code change.

### Recommended order (the roadmap)
1. ✅ **Companion rate-limit + cost cap** (done — wall 2).
2. ◗ **Source caching/CDN prep + `/watch` throttle** (cache headers + global `/watch` limit done;
   the "stop proxying non-gated segments" bandwidth win still needs the live stack — walls 1 + 3).
3. Source-service → always-on VPS + Cloudflare in front (edge cache + hides the origin IP).
4. CDN for segments / prefer ABR-HLS / proxy pool (when bandwidth actually bites).
5. Co-watch on managed pub/sub (feature-driven, §12).
6. Paid LLM tier or self-hosted GPU (only once usage justifies it — §10 D/E).
