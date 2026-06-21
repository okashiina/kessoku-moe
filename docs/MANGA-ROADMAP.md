# Kessoku.moe — Manga & Manhwa Reader Roadmap

Goal: a new in-repo section where users read **manga, manhwa, and manhua** on
kessoku.moe, in **Japanese + English + Indonesian**, with the proven feature set of
the best readers (MangaDex, ComicK, Mihon/Tachiyomi, Bato.to) — own catalog UI, own
reader, own image proxy, no ads, attribution-compliant.

This is a living plan, modeled on [STREAMING-ROADMAP.md](STREAMING-ROADMAP.md).
Backed by the deep-research pass on 2026-06-21 (21 sources, 24 claims confirmed via
3-vote adversarial verification, 1 refuted). It is written to be executable by another
agent end-to-end.

---

## 0. Decisions locked (2026-06-21)

| Decision | Choice | Why |
|---|---|---|
| **Content source** | **MangaDex API only** for v1 | Free, official, third-party-friendly, covers manga + manhwa + manhua with native JP/EN/**ID** translations. Safest legal posture. ComicK kept as a *documented future fallback*, not built in v1. |
| **Metadata / catalog** | **AniList GraphQL** (already used app-wide) | One `Media` type for anime + manga; `countryOfOrigin` splits JP/KR/CN; rich filters; exposes external IDs. Reuses our existing AniList stack. |
| **Reader scope** | **Full** (P0 + P1 + P2) | User chose the complete feature set, built in phases. |
| **Image delivery** | **Proxy through our own server** (mandatory) | MangaDex hotlink rules forbid direct embedding; we already have [`fileProxy.ts`](../services/source-service/src/fileProxy.ts). |

Hard requirements satisfied: (1) manga **and** manhwa (and manhua) ✓; (2) JP + EN +
ID reading languages ✓ via MangaDex `translatedLanguage`; (3) free + programmatic ✓.

---

## 1. What the research established (cited)

- **MangaDex is the canonical free API.** Deliberately public, used as the reference
  source by the whole reader ecosystem (Mihon/Tachiyomi, Neko, Suwayomi). Exposes
  `/manga`, `/chapter`, scanlation-group, `/author`.
  ([mangadex.dev](https://mangadex.dev/an-api-to-rule-them-all/),
  [api.mangadex.org/docs](https://api.mangadex.org/docs/))
- **Image delivery = @home model.** `GET /at-home/server/{chapterId}` returns a
  **geographically-optimized base URL** (valid ~15 min, never hardcode), then build
  `{baseUrl}/{quality}/{chapterHash}/{filename}` where `quality` ∈ `data` |
  `data-saver`. `data-saver` is exactly our data-saver toggle.
  ([retrieving-chapter](https://api.mangadex.org/docs/04-chapter/retrieving-chapter/))
- **No hotlinking — must proxy.** @home enforces Referer/token validation; a wrong
  Referer returns a "you can read this at…" placeholder image. The reader MUST proxy
  every user image request. ([limitations](https://api.mangadex.org/docs/2-limitations/))
- **Rate limit ~5 req/s per IP** at the load balancer (429 on excess, ban on abuse),
  plus stricter per-endpoint caps. → throttle + backoff + honor `Retry-After`
  (global Rule 8). ([mangadex.dev](https://mangadex.dev/an-api-to-rule-them-all/))
- **Acceptable Usage Policy binds third-party readers:** credit MangaDex + scanlation
  groups; honor group takedown requests; **no ads / paid services** on the reader
  surface; no hotlinking. ([compliance/terms](https://mangadex.org/compliance/terms))
- **AniList is the right catalog layer, but metadata-ONLY.** Unified `Media` type
  (`MediaType` enum = `[ANIME, MANGA]`); `countryOfOrigin` distinguishes JP/KR/CN
  (verified: *Solo Leveling* → `type:MANGA, countryOfOrigin:KR, chapters:201`); rich
  browse args (`search, format_in, status, source, countryOfOrigin, genre_in,
  tag_in`, chapter/volume ranges). It serves **no page images** — pair with MangaDex.
  ([anilist media docs](https://docs.anilist.co/guide/graphql/queries/media))
- **AniList ↔ MangaDex mapping is built-in.** MangaDex `Manga.links` carries `al`
  (AniList), `mal`, `kt` (Kitsu), `mu` (MangaUpdates), `ap` (Anime-Planet). Resolve a
  catalog entry to its chapters via `links.al` or title search.
  ([MangaLinks schema](https://gondolyr.gitlab.io/mangadex-api/schema/v5/struct.MangaLinks.html))
- **Reader modes are the make-or-break feature.** Mihon ships Paged RTL (manga
  default), Paged LTR, Paged vertical, Long-strip, Long-strip-with-gaps, configurable
  **per series** — this is what serves manga (paged RTL) AND manhwa (long-strip) from
  one reader. ([mihon reader-settings](https://mihon.app/docs/guides/reader-settings))
- **Legal posture matters.** A US federal ruling (Oct 2025, *Shueisha v.
  Mangajikan.com*) made Cloudflare a §512(c) provider when caching, validating DMCA
  subpoenas that unmask pirate-site operators. → favor the compliant MangaDex/AniList
  path; treat ID scanlation scrapers (Komikcast/Komiku via Weebs_Scraper) as
  **high-risk** and out of scope.
  ([torrentfreak](https://torrentfreak.com/manga-pirate-site-operator-fails-to-dodge-dmca-subpoena-over-cloudflare-cache/))

**Refuted (do not rely on):** "AsuraScans is the only Consumet manhwa/manhua
provider" (0-3). **Out of scope for v1:** Consumet (hosted API demo-gated + repos
DMCA-blocked 2026-03, self-host-only), ComicK (Cloudflare anti-bot, domain flux),
Komikcast/Komiku scrapers (fragile + legal risk). All documented in §9 as future
options.

---

## 2. Target architecture

```
[ Next.js frontend ]
   /manga                 -> library / browse (AniList-driven)
   /manga/[anilistId]     -> series detail + chapter list (AniList + MangaDex)
   /read/[chapterId]      -> reader (MangaDex @home pages via proxy)
                 │
                 │  catalog/search/detail
                 ▼
[ AniList GraphQL ]  (packages/api + frontend/utility/anilist.ts)  ── metadata only
                 │
                 │  resolve title -> MangaDex manga -> chapters
                 ▼
[ MangaDex API ]  api.mangadex.org   (server-side, rate-limited, cached)
   ├─ /manga?... (+ includes[]=cover_art, links.al)
   ├─ /manga/{id}/feed  (chapters, translatedLanguage[]=ja,en,id)
   └─ /at-home/server/{chapterId}  -> { baseUrl, chapter:{hash,data[],dataSaver[]} }
                 │
                 ▼
[ image proxy ]  source-service /file  (forwards Referer, streams, caches)
   GET /file?url=<baseUrl>/<quality>/<hash>/<filename>&ref=https://mangadex.org
                 │
                 ▼
[ <MangaReader> ]  paged RTL/LTR/vertical + long-strip(webtoon), preloading,
                   resume, data-saver, language switch, group attribution
```

Key reuse points (verified in the codebase, see [§5](#5-codebase-integration-map)):
- **Image proxy already exists** — [`services/source-service/src/fileProxy.ts`](../services/source-service/src/fileProxy.ts)
  already forwards `Referer`/`Origin` + `Range` and streams. Manga pages are a new
  caller of the same `/file` endpoint (or a thin `/manga-image` alias).
- **Provider-switcher pattern** — mirror [`embedProviders.ts`](../frontend/utility/embedProviders.ts)
  as `mangaProviders.ts` so ComicK can slot in later without a rewrite.
- **Progress + AniList sync** — mirror [`progress.ts`](../frontend/utility/progress.ts)
  as `mangaProgress.ts`; reuse the AniList sync conventions (manga uses the same
  `MediaList` mutations with `progress` = chapters).
- **Comments / notifications / cards / rails** — all reusable (see §5).

---

## 3. MangaDex API integration spec (the concrete recipe)

All calls are **server-side** (Next.js API routes or `packages/api`), never from the
browser, so the rate limit + key handling stays controlled.

### 3.1 Endpoints used (all GET, all unauthenticated for read)

| Need | Call | Notes |
|---|---|---|
| Resolve AniList → MangaDex | `GET /manga?...&includes[]=cover_art` then match `attributes.links.al == anilistId` | Fallback: search by title + `year` + `originalLanguage`. Cache the AniList→MangaDex id mapping (long TTL). |
| Series detail | `GET /manga/{id}?includes[]=cover_art&includes[]=author&includes[]=artist` | Covers, tags, contentRating, status, original language. |
| Chapter list | `GET /manga/{id}/feed?translatedLanguage[]=ja&translatedLanguage[]=en&translatedLanguage[]=id&order[chapter]=asc&includes[]=scanlation_group&limit=500` | Paginate via `offset`. Group by `attributes.chapter`; expose a per-chapter **language switch** + group attribution. |
| Chapter pages | `GET /at-home/server/{chapterId}` → `{ baseUrl, chapter:{ hash, data[], dataSaver[] } }` | Build `{baseUrl}/{data|data-saver}/{hash}/{filename}`. **Re-fetch if older than ~15 min.** |
| Cover image | `https://uploads.mangadex.org/covers/{mangaId}/{cover.fileName}` | Proxy too (or add host to `next.config.js`); `.512.jpg`/`.256.jpg` thumbs exist. |

### 3.2 Image proxy (hard requirement)

Every page + cover URL is served through our proxy, never embedded directly:

```
GET /file?url=<encoded @home page url>&ref=https://mangadex.org
```

- Reuse [`fileProxy.ts`](../services/source-service/src/fileProxy.ts): it already sets
  `Referer`/`Origin`, forwards `Range`, streams without buffering, and caches full
  files (`Cache-Control: public, max-age=86400`). Add an **allowlist** so the proxy
  only fetches `*.mangadex.network` / `uploads.mangadex.org` hosts (SSRF guard).
- If the frontend runs without the source-service (prod embed-only today), add a
  thin Next.js `/api/manga/image` route as a fallback proxy with the same Referer
  injection, so the reader works on the Railway deploy too.

### 3.3 Rate limiting + cost guards (global Rule 8)

- **Outbound throttle** to MangaDex: token-bucket at **≤5 req/s per egress IP**, with
  a small safety margin (e.g. 4 req/s). Use the `rate-limiting-implementation` skill.
- **Retry on 429/5xx** with exponential backoff + jitter; **honor `Retry-After`**.
- **Cache aggressively** (the single biggest abuse-avoidance lever): AniList→MangaDex
  id map (days), `/manga/{id}` detail (hours), `/feed` chapter lists (10–30 min),
  `@home` base URLs (≤15 min — they expire). Cache covers/pages at the proxy (1 day).
- **Per-user / per-IP throttle** on our own `/api/manga/*` routes so one client can't
  exhaust our MangaDex budget or get our IP banned.
- No keys are logged; no MangaDex calls from the client.

### 3.4 Compliance (AUP) — build it in, not bolt it on

- **Attribution UI:** every chapter shows its **scanlation group** name (+ link) and a
  "Read on MangaDex" credit. Required by the AUP.
- **No ads / no paywall** on any reader surface (already our posture).
- **Takedown handling:** a documented manual path to hide a title/chapter on request
  (a `hidden` flag in our cache table is enough for v1).
- **Content rating filter:** respect `contentRating` (`safe` / `suggestive` /
  `erotica` / `pornographic`); default the catalog + feed to `safe`+`suggestive`,
  gate the rest behind an explicit NSFW opt-in (reuse the companion 18+ gate pattern).

### 3.5 Auth — OPEN (validate before build, see §8)

Read endpoints (catalog, chapter feed, @home images) work **unauthenticated**. Login
(OAuth2 personal client) is only needed for *MangaDex-side* follows/ratings — which we
do **not** need, because reading status/progress lives in **our** store + **AniList**.
Confirm current (2024-2026) auth behavior before relying on the unauthenticated path
for `@home` at scale.

---

## 4. Reader feature spec (Full scope, phased P0 → P2)

Built from the Mihon/Comick/Bato.to benchmark. Reading modes are the keystone.

### P0 — v1 must-have

1. **Reading modes**, configurable **per series** (persisted):
   - **Paged RTL** — default for Japanese manga (`originalLanguage == ja`).
   - **Paged LTR**.
   - **Paged vertical**.
   - **Long-strip (webtoon)** + long-strip-with-gaps — default for manhwa/manhua
     (`countryOfOrigin` KR/CN). Continuous vertical scroll.
   - Auto-pick the default by origin; user override wins and is remembered.
2. **Image proxy layer** (§3.2) — required, not optional.
3. **Reading progress + resume** — `mangaProgress.ts` (mirror `progress.ts`):
   `{ lastChapterId, chapterNumber, page, totalChapters, read[], updatedAt }`, key
   `kessoku.mangaProgress.v1`. "Continue reading" rail on `/manga` + resume on detail.
4. **Data-saver vs full quality toggle** — picks `data` vs `data-saver` from @home.
5. **Per-chapter language switch** — JP / EN / ID via `translatedLanguage`; remember
   the preferred language per series; show which languages a chapter exists in.
6. **Scanlation-group attribution** + **content-rating / NSFW filter** (§3.4).

### P1 — second wave

- **Library / follows / bookmarks** — reuse the watchlist/status pattern; push manga
  reading status to **AniList** (`SaveMediaListEntry`, `progress` = chapters read,
  `type: MANGA`). Mirror the watch-side `listStatus` + tombstone/dirty sync layer.
- **Advanced search + filters** — drive from AniList browse args (genre/tag/status/
  format/country/year/sort); manga tab in the existing `/search`.
- **Image preloading** — prefetch next N pages (paged) / lazy-window (long-strip).
- **Chapter feed / "latest updates"** rail — MangaDex `/chapter?order[readableAt]=desc`
  filtered to followed titles or popular ones.

### P2 — full parity

- **Downloads / offline** — cache chapters (proxied images) for PWA offline reading;
  integrate with the existing service worker.
- **Comments per chapter** — reuse [`CommentsSection.tsx`](../frontend/components/comments/CommentsSection.tsx)
  with `targetType: 'manga' | 'manga_chapter'`; same voting/reporting/reply-notif flow.
- **Double-page spread** (paged mode, landscape) + reader UX polish (zoom, fit-width/
  fit-height, keyboard nav, tap zones, page counter, chapter prev/next).

---

## 5. Codebase integration map

(Verified read-only against the repo, 2026-06-21.)

| Aspect | Anime (existing) | Manga (new) |
|---|---|---|
| Router | Pages Router | `pages/manga/index.tsx`, `pages/manga/[id].tsx`, `pages/read/[id].tsx` |
| Catalog API | [`frontend/utility/anilist.ts`](../frontend/utility/anilist.ts), `packages/api` | add `mangaPage()` / `searchManga()` (AniList `type: MANGA`) |
| Content resolve | provider in [`embedProviders.ts`](../frontend/utility/embedProviders.ts) | `frontend/utility/mangaProviders.ts` (MangaDex now, ComicK later) + `packages/api/src/mangadex.ts` |
| Images | [`source-service/src/fileProxy.ts`](../services/source-service/src/fileProxy.ts) | **reuse** `/file` (+ allowlist) or `/api/manga/image` fallback |
| Progress | [`progress.ts`](../frontend/utility/progress.ts) + AniList sync | `mangaProgress.ts` + AniList `MANGA` MediaList sync |
| Status/library | `listStatus.ts`, `StatusSelect.tsx`, watchlist | reuse the same pattern for manga |
| UI | `anime/Card.tsx`, `Section.tsx`, `Banner.tsx` | **reuse** (poster 2:3, rails) + new `read/*` components |
| Reader | `watch/HlsPlayer.tsx` | new `components/read/{MangaReader,PagedViewer,WebtoonViewer,ReaderSettings,ChapterNav}.tsx` |
| Comments | `comments` table, `targetType: anime\|episode` | add `manga\|manga_chapter` |
| Notifications/push | existing inbox + web push | reuse for "new chapter" (cron) |
| Styling | Tailwind + OKLCH tokens (`canvas/fg/accent`) | reuse tokens; no new design system |
| DB | Drizzle + Postgres, [`schema.ts`](../frontend/utility/db/schema.ts) | additive tables (see §6) |

New files (indicative):

```
frontend/
  pages/
    manga/index.tsx            # library / browse
    manga/[id].tsx             # series detail + chapter list
    read/[id].tsx              # reader (by MangaDex chapterId)
    api/manga/
      resolve.ts               # anilistId -> mangadex id (cached)
      chapters.ts              # /feed proxy (lang-filtered, cached, rate-limited)
      pages.ts                 # /at-home/server proxy (cached <15m)
      image.ts                 # fallback image proxy (Referer-injecting)
  components/
    read/{MangaReader,PagedViewer,WebtoonViewer,ReaderSettings,ChapterNav,PageImage}.tsx
    manga/{Card,Section,ChapterList,LanguagePicker,GroupCredit}.tsx
  utility/
    mangaProviders.ts          # provider abstraction (MangaDex; ComicK later)
    mangaProgress.ts           # localStorage + AniList sync
  hooks/
    useMangaProgress.ts useMangaChapters.ts useMangaReaderPrefs.ts
packages/api/src/
  mangadex.ts                  # typed MangaDex client (throttled + cached)
```

---

## 6. Data model (additive migrations — Rule 6)

Most state is local (`mangaProgress.v1`) + AniList. The DB only gains what needs to be
shared/server-side. **All additive; show the SQL + ask before migrating prod, then
push (Rule 6 / global Rule 6).**

- **Reuse `comments`/`notifications`** by widening `targetType` to include
  `'manga'` and `'manga_chapter'` (no schema change if it is a free-text/enum that can
  take new values; if it is a Postgres `enum`, **add values** — never swap).
- **New (optional, only if server-side library/sync is wanted beyond AniList):**

```sql
-- manga reading progress (server mirror of localStorage, for logged-in cross-device)
CREATE TABLE manga_progress (
  id              serial PRIMARY KEY,
  anilist_user_id integer NOT NULL,
  anilist_id      integer NOT NULL,           -- AniList MANGA id
  mangadex_id     uuid,                        -- resolved source id (nullable until resolved)
  chapter         numeric NOT NULL DEFAULT 0,  -- last chapter read (supports 12.5)
  page            integer NOT NULL DEFAULT 0,
  total_chapters  integer,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anilist_user_id, anilist_id)
);

-- cached AniList<->MangaDex resolution (avoid re-resolving + cuts MangaDex calls)
CREATE TABLE manga_source_map (
  anilist_id   integer PRIMARY KEY,
  mangadex_id  uuid NOT NULL,
  hidden       boolean NOT NULL DEFAULT false, -- takedown flag (AUP)
  resolved_at  timestamptz NOT NULL DEFAULT now()
);
```

Defer both if AniList + localStorage cover v1 — start with **zero new tables** and add
`manga_source_map` first (pure cache, lowest risk) only when call volume warrants it.

---

## 7. Phases & decision gates

- **Phase 0 — Validate — DONE (2026-06-21).** Outcome below; gate **passed** (EN+ID
  viable for manga AND manhwa). One caveat: JP/KR raws are not on MangaDex.

  **Phase 0 results (verified via live API):**
  - 🔑 **MangaDex is DNS-blocked in Indonesia, but it is PURE DNS poisoning** — all
    `*.mangadex.org` resolve to a local ISP sinkhole `202.169.44.80` (real IP is
    `45.129.229.x`). Forcing the real IP + correct SNI → API responds normally
    (`/ping` = `pong`, queries work). **No SNI/DPI filtering.** → the server-side
    MangaDex client + image proxy MUST resolve via **DoH (DNS-over-HTTPS)** / custom
    resolver, NOT the system resolver. With DoH it works from the user's Indonesian
    laptop (local dev) AND any deploy egress. This is the key architectural unlock.
  - ✅ **Unauthenticated read works** (`/ping`, `/manga`, `/manga/{id}/aggregate`,
    `availableTranslatedLanguages`). No auth needed for catalog/feed/@home.
  - ✅ **EN + ID broadly available for manga AND manhwa** (authoritative
    `availableTranslatedLanguages` on the main entry): Chainsaw Man (32 langs, EN+ID),
    Jujutsu Kaisen (25, EN+ID), One Piece (24, EN+ID), **Solo Leveling / manhwa** (32,
    EN+ID), Berserk (19, EN+ID), Kagurabachi (17, EN+ID).
  - ⚠️ **JP raws essentially absent** (`ja` = not available on every title tested) —
    MangaDex does not host original Japanese (licensing); Korean raws for manhwa
    likewise. This is universal to safe/legal free sources, not MangaDex-specific. The
    "JP" reading language is therefore best-effort: surface it per-title when it exists
    (rare), don't promise it. EN + ID are the real deliverable for the ID audience.
  - 🛠️ **Title search needs entry-disambiguation:** `?title=` + relevance sometimes
    ranks side entries (Official Colored, doujin, "Book Version" with 0 langs) above
    the canonical series. The client must prefer the entry with the most
    `availableTranslatedLanguages` / matching `originalLanguage` / highest follows, or
    resolve via AniList `links.al` first. (Methodology note: the `/aggregate` per-lang
    chapter COUNT undercounts/rate-limits unreliably — use `availableTranslatedLanguages`
    for presence and paginated `/feed` for the real chapter list.)
- **Phase 1 — Catalog (read-only).** `mangaPage()`/`searchManga()` on AniList; `/manga`
  library + `/manga/[id]` detail with chapter list (MangaDex `/feed`, lang-filtered,
  cached, throttled). No reader yet. Reuses existing cards/rails. Gate: a real series
  (e.g. Chainsaw Man + Solo Leveling) lists JP/EN/ID chapters with group attribution.
- **Phase 2 — Reader (P0).** `MangaReader` with paged RTL/LTR/vertical + webtoon,
  image proxy, progress+resume, data-saver, language switch, NSFW filter. Gate: read a
  manga (paged RTL) AND a manhwa (long-strip) end-to-end in a real browser + the
  **mobile/PWA audit** (CLAUDE.md §4 — reader is touch-heavy: tap zones, long-press,
  safe-area, no iOS 100vh break).
- **Phase 3 — Library + discovery (P1).** AniList manga MediaList sync, advanced
  filters, preloading, latest-updates feed.
- **Phase 4 — Full parity (P2).** Offline downloads, per-chapter comments, double-page
  + reader polish.

Each finished feature follows PPRM (CLAUDE.md §4): feature branch → tsc + lint clean →
mobile/PWA audit on any UI diff → in-browser smoke → PR → merge. **No commit/push/PR
until the user explicitly says so** (CLAUDE.md §3).

---

## 8. Validation to run before/at Phase 0 (open questions)

1. **ID coverage depth.** Query `GET /manga/{id}/feed?translatedLanguage[]=id` for a
   basket of real titles — popular manga (Chainsaw Man, JJK, One Piece), popular
   manhwa (Solo Leveling, Omniscient Reader, Tower of God), a few mid/niche — and
   measure how many ID chapters exist + how fresh. Decides whether ID is a true
   primary language on MangaDex-only or still leans on the (out-of-scope) ID scrapers.
2. **Auth requirements (2024-2026).** Confirm which read endpoints work fully
   unauthenticated (catalog / feed / @home image) vs. need an OAuth2 personal client,
   and the per-client token/rate-limit behavior, before committing the unauth path.
3. **Egress IP posture.** From the deploy egress (Railway / VPS), confirm
   `api.mangadex.org` + `*.mangadex.network` are reachable and not challenged (the
   streaming side learned datacenter IPs get challenged — manga should be fine since
   MangaDex is not Cloudflare-gated, but verify).

---

## 9. Future options (documented, NOT in v1 scope)

Kept as a fallback ladder if MangaDex-only proves insufficient (e.g. ID coverage thin
per Phase 0):

- **ComicK** (`api.comick.dev`) — multi-language (incl. ID), explicitly manga +
  manhwa + manhua. Cost: **Cloudflare anti-bot** + domain flux (comick.fun → .io →
  .dev/.live mirrors). Would need the same anti-bot handling as the streaming side
  (FlareSolverr-grade) and config-as-data for the live host. Slot in behind the
  `mangaProviders.ts` abstraction.
- **Consumet (self-hosted)** — wraps MangaDex + ComicK + others. Public API now
  demo-gated and repos DMCA-blocked (2026-03) → self-host-only, extractors break
  often. Only worth it as a multi-provider aggregator if we outgrow direct clients.
- **ID scanlation scrapers** (Komikcast / Komiku via
  [Weebs_Scraper](https://github.com/fahmih6/Weebs_Scraper)) — deepest Indonesian
  coverage but **fragile** (403/IP-ban on VPS) and **legally risky** post-*Shueisha v.
  Cloudflare*. Avoid unless ID coverage is a hard miss and the risk is explicitly
  accepted by the user.

Provider order would mirror the streaming SOP: abstraction + fallback chain, circuit
breaker per provider, config-as-data for hosts, caching everywhere.

---

## 10. Skills for the build (mandatory per CLAUDE.md)

- **Reader + catalog UI** (touch-heavy, new surface): `/impeccable`, `/ui-ux-pro-max`,
  `/frontend-design` (+ `/taste-skill` or `/soft-skill` for visual passes).
- **Mobile/PWA gate** before any UI PR: `/mobile-pwa-audit` (reader is gesture- and
  fullscreen-heavy — exactly the phone-only break surface).
- **Any user-facing copy** (section labels, empty states, CTAs): `/brand-copywriter` +
  `/brand` + `/stop-slop` — English, brand voice, no em dashes, show-don't-tell.
- **MangaDex rate limiting**: `rate-limiting-implementation` (token bucket + backoff +
  quota, global Rule 8).
- **Scraping/anti-bot** (only if ComicK/§9 is ever pursued): `/web-scraping`,
  `/playwright-cli`.

Per global Rule 5: state which skills were loaded and confirm any direction-setting
decision (reader visual direction, default reading mode per origin, NSFW gating UX)
with the user before committing.

---

## Changelog

- **2026-06-21 — Created.** Deep-research pass (MangaDex vs ComicK/Consumet/AniList,
  ID coverage, legal posture, reader feature benchmark) + repo integration map.
  Decisions locked: MangaDex-only source, AniList metadata, Full reader scope.
- **2026-06-21 — v1 BUILT (Phases 0–2 + parts of 3).** End-to-end manga/manhwa
  reader shipped in-repo, tsc + lint clean, smoke-verified live against the
  Indonesian connection (real 392 KB JPEG served through the proxy; ID + EN tabs on
  Chainsaw Man). **The DNS-poisoning discovery (Phase 0) is the load-bearing piece:**
  a server-side DoH-resolving MangaDex client (`utility/server/mangadex.ts`) makes it
  work from the user's laptop AND any egress with zero dependency change. Files:
  - Client: `utility/server/mangadex.ts` (DoH lookup, ~4 rps throttle + 429 backoff,
    LRU caches, search/resolve/feed/at-home/image helpers).
  - API routes: `api/manga/image.ts` (streaming proxy + Referer), `api/manga/chapter/
    [chapterId]/pages.ts` (at-home → proxied page URLs, both quality tiers).
  - Catalog: `utility/manga.ts` (AniList MANGA home/detail/browse + origin helpers).
  - State: `utility/mangaProgress.ts`, `utility/readerPrefs.ts`.
  - Pages: `pages/manga/index.tsx` (rails + search + filters + Continue reading),
    `pages/manga/[id].tsx` (detail + chapter list), `pages/read/[id].tsx` (reader).
  - Components: `manga/{Card,Section,ContinueReading,ChapterList}.tsx`,
    `read/MangaReader.tsx` (paged RTL/LTR + webtoon/vertical, data-saver, per-series
    language switch, scanlation-group attribution, progress + resume, prev/next).
  - Nav: "Manga" link added to `components/Header.tsx`.
  - Design: matched the existing Midnight-Aurora tokens (no new design system), per
    `/frontend-design` + `/impeccable`.
  **Done in v1 (P0 + most of P1):** reading modes (paged RTL/LTR + webtoon +
  long-strip-with-gaps, per-series default by origin), image proxy, progress/resume,
  data-saver toggle, per-chapter language switch (id/en/ja + original), group
  attribution, AniList advanced search/filters, image preloading (paged), library +
  Continue-reading rail. **Still pending:** mobile/PWA audit (pre-PPRM gate, CLAUDE.md
  §4); AniList MediaList sync for manga (push chapters read); per-chapter comments
  (P2, reuse CommentsSection with `targetType:'manga_chapter'`); offline downloads
  (P2); double-page spread (P2); follows/bookmarks server layer.
  **Not committed** — awaiting user PPRM (CLAUDE.md §3).

---

## Update 2026-06-21 — prod source bypass, search fix, landing announcement

Three shipped changes (PR `feat/manga-prod-source-and-landing`):

- **Prod manhwatop bypass (`MANHWATOP_PROXY`).** The Pizza BL (and other licensed
  KR BL/adult on manhwatop) returned "No readable chapters" on Railway while working
  on localhost. Root cause: manhwatop's Cloudflare blocks **datacenter IPs** (Railway),
  so even `curl` gets the "Just a moment" challenge; a residential IP (the laptop)
  passes. Fix: `utility/server/madara.ts` now reads `MANHWATOP_PROXY` and, when set,
  routes BOTH the HTML `curl` (execFile) and the image stream (spawn) through it via
  `--proxy` (longer 45s timeout for proxied bytes). Unset = direct curl, unchanged
  (localhost stays working). Accepts any curl proxy URL: a paid residential proxy
  (`http://user:pass@host:port`, always-on) or a free self-hosted SOCKS5 tunnelled
  from a home box (`socks5://...`, needs that box awake). Server-only runtime var on
  the Railway frontend service — no rebuild, restart only. MangaDex (DoH) + Weebcentral
  are unaffected and need no proxy.
- **Search results manga fix.** `/search` (type=manga) reinvented a card with
  `aspect-[2/3]`, which collapses to 0 height (core aspectRatio plugin disabled) —
  no thumbnail + a thin barely-tappable strip. Replaced the bespoke card with the
  shared `components/manga/Card.tsx` (uses `aspect-w-2 aspect-h-3`), so covers,
  origin tags, and the `/manga/[id]` link match the catalog. Grid matches `/manga`.
- **Landing announcement.** Splash (`pages/index.tsx`): hero broadened to "anime and
  manga, one stage", a dedicated "Read between episodes" section with an interactive
  reader mock (Webtoon/Paged toggle) + "Open the reader" CTA, a "manga & manhwa · NEW"
  credential chip, and a "Manga" nav link. Brand-voiced copy (`brand-copywriter` +
  `brand` + `stop-slop`); honest about coverage ("English and Indonesian, wherever the
  scanlators have them"). Mobile/PWA audit (Android + iOS) run: one sub-44px tap-target
  blocker (the mock toggle) + warns fixed — all new controls ≥44px with touch-action +
  active feedback. tsc + next lint clean.

## Update 2026-06-21 (2) — manhwatop prod fix via residential RELAY

The `MANHWATOP_PROXY` (CONNECT proxy) approach did NOT fix manhwatop in prod.
Diagnosis: a CONNECT proxy only tunnels bytes, so the Railway container still
performs the TLS handshake with manhwatop. Cloudflare blocks the Linux
container's curl TLS fingerprint **even from a residential IP** (verified: the
same residential tunnel returns the full page to a Windows curl but the container
gets an empty/challenge response). Fixing the egress IP is not enough; the
fingerprint doing the handshake is the tripwire.

Fix = a **relay**: a residential machine fetches the page itself (its curl passes
Cloudflare) and returns the bytes; the container never speaks TLS to manhwatop.
- `frontend/utility/server/madara.ts`: when `MANHWATOP_RELAY` (+ `MANHWATOP_RELAY_KEY`)
  is set, `getText` and image streaming go through `<relay>/f?u=<url>` instead of
  curl. Unset = direct curl (localhost), unchanged.
- `frontend/pages/api/manga/image.ts`: prefers the relay stream when enabled.
- `tools/manhwatop-proxy/relay.mjs`: the laptop-side relay (HTTP service, key-auth,
  manhwatop-only SSRF guard), exposed over an ngrok HTTP **static domain** (free,
  no credit card — the card requirement was only for ngrok TCP). Static domain +
  stable key ⇒ set the Railway vars once, no redeploy churn.
- Verified locally end-to-end: search returns the slug, chapter list returns 102
  chapters, key-auth rejects (403), non-manhwatop rejected (400).
- Trade-off: relay machine must be awake. The CONNECT-proxy path (`MANHWATOP_PROXY`)
  is left in place as a local convenience but does not bypass Cloudflare from a
  datacenter. For true 24/7 hands-off, a paid residential proxy + a
  browser-fingerprint client (e.g. curl-impersonate) would be needed; the relay
  is the free route.
