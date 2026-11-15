# Handoff 2026-11-15: deploy the hianime.at provider

For a Claude Code session running **on the owner's own machine**. The cloud session
that wrote this could not reach the machine that hosts the source-service, so the
deploy and the Indonesian-network checks are left for you.

## What's already done (on `main`)

- `services/source-service/src/providers/hianime.ts` now scrapes **hianime.at**
  (ZokoAnime embed → `window.__P` = base64(JSON XOR `otaku-embed-v1`) → master m3u8
  plus soft VTT subtitles). It replaces the dead hianime.to / `aniwatch` path and
  keeps the `hianime` id.
- Default Auto chain: `kaa,hianime,animepahe,allanime` (`src/config.ts`, `.env.example`).
- Verified from a US cloud sandbox: `/watch` returns `mode: direct, provider: hianime`
  in 0.6 to 1.9 s. Subtitles come in up to 18 languages, often including `id`. Sub and
  dub both work. Segments are 1080p h264/aac.
- Background and live results: `docs/PROVIDER-SHORTLIST-2026-11.md`.
- Probe script: `services/source-service/scripts/probe-kaa-alternatives.mjs`.

## What you need to do

1. **Find the host machine.** Per `docs/SHARE-FOR-TESTING.md`, the source-service
   normally runs on the Windows laptop (Docker + Tailscale Funnel at
   `https://okashiina.taild5f30a.ts.net`). If this session runs on a different machine
   (e.g. the MacBook), tell the owner the rebuild has to happen on the host. Don't
   start a second public instance without asking.
2. **Pull and rebuild** on the host:
   ```bash
   git checkout main && git pull
   docker compose -f services/source-service/docker-compose.yml up -d --build
   curl http://localhost:8088/health
   ```
3. **Fix the local `.env`.** If `services/source-service/.env` has a `PROVIDERS=` line,
   set it to `PROVIDERS=kaa,hianime,animepahe,allanime`. The `.env` is gitignored and
   overrides the code default. Keep `PUBLIC_BASE_URL` as is. Rebuild after editing.
4. **Check Indonesian reachability.** This is the main unknown. These hosts must load
   from the home network:
   ```bash
   for h in hianime.at zokoanime.video hls.dramahot.top hls1.drama1.cfd; do printf "%s " $h; curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 https://$h/; done
   ```
   Any code (even 403/404) means the host is reachable. A timeout or `000` means the
   ISP blocks it (SNI/DPI, like megacloud). If the CDN hosts are blocked, move
   `hianime` after `animepahe` in `PROVIDERS` (or drop it) and report back.
5. **Resolve through the service:**
   ```bash
   cd services/source-service
   node scripts/probe-kaa-alternatives.mjs "One Piece" latest
   curl "http://localhost:8088/watch?anilistId=21&episode=1180&provider=hianime&titles=ONE%20PIECE"
   ```
   Expect `"mode":"direct","provider":"hianime"`, an `/hls?url=...` source and several
   `/track?url=...` subtitles. Then fetch the returned `/hls` URL, one variant and one
   segment, and confirm HTTP 200.
6. **Watch one episode** in the app with Server = HiAnime. Confirm the picture has **no
   burned-in subtitles** (the cloud session couldn't check a frame) and that captions
   switch languages, Indonesian included.
7. Test from a device **not on the tailnet** (phone on mobile data). See the Caveats in
   `docs/SHARE-FOR-TESTING.md`.

## If something breaks

- `hianime: embed config did not decode (XOR key rotated?)`: check the current
  `deobfuscate_blob` key in `pystardust/ani-cli` and set `HIANIME_EMBED_KEY` in `.env`.
- Search misses a title: the provider tries every AniList title it gets (english,
  then romaji) and prefers an exact match. Debug with `HIANIME_DEBUG=1`.
- `cloudflare challenge`: hianime.at started gating. Route it through FlareSolverr the
  way `providers/kaa.ts` does.

## Not done (optional next)

- **AniZone** (`anizone.to`) as one more soft-sub fallback (sub only, clean video
  confirmed, ASS subtitles incl. `id`). Its flow is in the probe script and the
  shortlist doc.
- The `aniwatch` npm dependency is now unused by `src/`. Only the old research scripts
  import it.
