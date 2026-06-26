# animeflix source-service (Option B)

Self-hosted anime source resolver: **multi-provider scraper -> HLS proxy -> subtitles**, the same shape Miruro uses. It is deployed **separately on a VPS** (see [`../../docs/VPS-SETUP.md`](../../docs/VPS-SETUP.md)) so it never touches the Railway frontend build.

Plan, phases, and the anti-fragility SOP live in [`../../docs/STREAMING-ROADMAP.md`](../../docs/STREAMING-ROADMAP.md).

## What works now

- Fastify server with `/health`, `/status`, `/watch`, `/hls`, `/file`, `/track`, and `/subs`.
- Resolver with provider fallback chain, circuit breaker, and cache.
- HLS proxy that rewrites playlists/segments and injects Referer/Origin.
- FlareSolverr wired in (`fetcher.ts`, `solver: true`) for Cloudflare hosts.
- Embed fallback: `/watch` returns `{ mode: 'embed' }` when no provider yields a source, so the frontend keeps using its embed switcher.
- Working public direct providers: `animepahe` baseline HLS, `allanime` wired but currently captcha-blocked at source query, and `hianime` wired for soft-sub trials but network/VPS-gated.
- `aniliberty` is research-only/rejected for the normal player because verified streams are Russian audio, not JP audio.

## Run locally

```bash
npm install
cp .env.example .env
npm run dev          # http://localhost:8088
npm run typecheck    # tsc --noEmit
```

FlareSolverr is not required to boot; providers needing it fail soft until you run the full Docker stack.

## Run the full stack (VPS / Docker)

```bash
cp .env.example .env
docker compose up -d --build
curl http://localhost:8088/health     # {"ok":true}
```

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /health` | liveness |
| `GET /status` | uptime, Auto provider list, public forced providers, circuit-breaker state |
| `GET /watch?anilistId=&episode=&category=sub\|dub&titles=` | resolve -> `{mode:'direct',sources,subtitles}` or `{mode:'embed'}` |
| `GET /hls?url=&ref=` | HLS playlist/segment proxy |
| `GET /file?url=&ref=` | non-HLS file proxy |
| `GET /track?url=&ref=` | provider subtitle proxy for external VTT tracks |
| `GET /subs` | external subtitle resolver/proxy (Jimaku/subdl) |

## Frontend wiring

The Next.js watch page calls `/watch` first; on `mode:'direct'` it feeds the sources to `HlsPlayer`; on `mode:'embed'` it renders the existing `EmbedPlayer`. Set `NEXT_PUBLIC_SOURCE_SERVICE_URL` to this service's public URL.

## Next

1. Add canary probes for `animepahe`, `allanime`, and `hianime`.
2. Keep AniLiberty out of public player choices unless a JP-audio track is proven per release.
3. Revisit AllAnime only if its `NEED_CAPTCHA` source-query block gets a new bypass.
4. Validate HiAnime from a clean VPS before putting it in the Auto chain.