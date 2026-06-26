# Source Research Continuation - 2026-06-25

This continues the source research after AllAnime started returning `NEED_CAPTCHA` from its episode/source GraphQL endpoint.

Scope:
- Find sources comparable to AllAnime for direct playback.
- Prefer clean/raw JP audio with no burned subtitles.
- Keep external subtitles in our own player.
- Avoid executing or opening suspicious third-party player JavaScript during research.

## Why The Claude Temp Files Got Quarantined

Windows Defender flagged files under:

`C:\Users\nrkp2\AppData\Local\Temp\claude\c--Projects-kessoku-moe\...\tasks\*.output`

Detected item shown by Defender:

`Trojan:JS/Redirector.PGRD!MTB`

Most likely cause:
- Claude spawned multiple research/scraping subtasks.
- One or more subtasks fetched raw HTML/JS from streaming/ad/embed pages.
- Claude saved that raw output into temp task output files.
- Defender scanned the output file and matched obfuscated redirect JavaScript.

This does not necessarily mean the code was executed. It means malicious-looking JS landed on disk. Quarantine is the right outcome.

Recommended action:
- Do not restore those quarantine entries.
- Let Defender remove them, or manually clear the `Temp\claude` folder after closing Claude.
- Run a Defender full scan or offline scan if you want extra confidence.
- Do future provider research using repo/docs/API pages first, then isolated probes. Avoid saving full third-party player HTML/JS unless needed.

Why token usage burned so fast:
- The pasted Claude task launched several subagents in parallel.
- Each subagent got a large prompt plus repo context.
- Web fetches of GitHub/pages/HTML are often huge.
- Opus high effort multiplies reasoning tokens per subagent.
- So this was not "deep research" as a product mode, but it still behaved like one token-wise.

## Current Known Baseline

From the latest live local probes:
- `AnimePahe` works for direct playback through our source-service.
- `AllAnime` search works, but episode/source GraphQL returns `NEED_CAPTCHA` for both One Piece and Frieren.
- The resolver now treats that as a hard AllAnime failure and quickly falls back to AnimePahe.
- The existing embed providers already include 4Animo, Videasy, Vidnest, Vidlink, Megaplay, and VidPlus.

Earlier repo research already found:
- HiAnime/Zoro was the true soft-sub path, but its ecosystem was hit by shutdown/DMCA and/or reachability problems.
- AnimeKai/Kaido was previously considered dead/unstable.
- AllAnime was selected because it had better coverage and dub availability, but it is hardsub and now captcha-gated at the source endpoint.

## Safety-First Research Method Used Here

Used:
- Project docs and local code.
- npm package metadata.
- GitHub/repo/docs pages where accessible.
- Web search snippets for shutdown/status signals.

Avoided in this continuation:
- Opening arbitrary third-party player pages in a browser.
- Saving full obfuscated player JavaScript to disk.
- Running unknown scraped scripts.

## Ranked Candidate Shortlist

### 1. AniLibria / AniLiberty - Rejected For Normal Player

Verdict: REJECTED-FOR-PLAYER after implementation probe. The API/HLS path works, but the tested streams are Russian audio, not JP audio.

Why it matters:
- AniLibria is a Russian anime streaming platform with public API wrappers still seeing activity.
- It is likely to provide structured metadata and stream playlists without the same English hardsub problem.
- It may include JP audio plus Russian dub/voice tracks depending on title.

Evidence:
- `vraestoren/anilibria.py` describes itself as a web API for AniLibria and was pushed in 2026-04.
- npm search also found multiple AniLibria wrappers, though many are older.

Tradeoffs:
- Coverage is not AllAnime-level global coverage.
- Dub focus is Russian, not English.
- It may not cover every currently-airing title we care about.
- Need to verify whether returned video is clean JP audio, Russian dub, or mixed per release.

Probe next:
- Search One Piece, Frieren, a currently-airing show.
- Inspect API response for playlist URLs, audio tracks, subtitles, and CDN host.
- Confirm CORS/referer requirements.
- Confirm reachability from Indonesia and Docker source-service.

Sources:
- https://github.com/vraestoren/anilibria.py
- https://www.anilibria.tv/

### 2. Nyaa / AnimeTosho Release Pipeline - Best Quality/Raw Option, But Heavy Architecture

Verdict: USABLE ONLY AS A BIGGER ARCHITECTURE PROJECT.

Why it matters:
- This is the most realistic path to real clean/raw anime releases.
- Raw and fansub releases often include clean video and separate subtitle attachments.
- AnimeTosho can expose release metadata/attachments; Nyaa is the common index.

Tradeoffs:
- Not a simple HTTP source provider.
- Requires torrent/magnet handling, release selection, caching/storage, and maybe transcoding/remuxing.
- On-demand streaming from torrent is complex and fragile for a web app.
- Legal and ops risk are higher.

Best use:
- Not immediate direct provider.
- Good for a cached personal library or background prefetch for selected shows.
- Good subtitle matching source because releases reveal exact group/cut.

Probe next:
- Evaluate AnimeTosho JSON/API/attachments for subtitle extraction.
- Evaluate whether we can map AniList title + episode to trusted releases.
- Consider "download/remux/cache first, then serve" instead of instant streaming.

Sources:
- https://animetosho.org/
- https://animetosho.xyz/news/17
- https://nyaa.si/

### 3. Aniwatch / HiAnime Forks - Soft-Sub Shape Is Ideal, But Origin Risk Is High

Verdict: RISKY.

Why it matters:
- The `aniwatch` package still exists on npm and was modified in 2026-03.
- It targets `hianimez.to` and historically returned m3u8 sources plus subtitle arrays.
- This is closest to our ideal player contract when it works.

Evidence:
- npm `aniwatch` latest is `2.27.9`, published 2026-03-14.
- npm search shows several forks and HiAnime packages.
- Web search/status sources indicate HiAnime itself went offline around 2026-03-13.

Tradeoffs:
- Even if npm package exists, upstream site/origin may be dead or unstable.
- MegaCloud/HiAnime ecosystem has repeated takedown pressure.
- Previous local notes say Indonesia reachability was bad.
- Needs live probe before any integration work.

Probe next:
- Install/use in a disposable script only, no player-page JS saved.
- Search + episode source for Frieren and One Piece.
- Confirm whether any returned subtitles are real VTT and whether stream CDN is reachable.

Sources:
- https://www.npmjs.com/package/aniwatch
- https://en.wikipedia.org/wiki/HiAnime
- https://github.com/ghoshRitesh12/aniwatch-api

### 4. Consumet / @consumet/extensions Providers - Useful Reference, Not Primary Bet

Verdict: RISKY AS A PROVIDER SOURCE, useful as code reference.

Why it matters:
- `@consumet/extensions` still published `1.8.8` in 2026-01 per npm.
- It includes anime provider abstractions and examples like Gogoanime.

Tradeoffs:
- The project is historically fragile and provider-dependent.
- Some repo/status pages are stale or GitHub rate-limited from this environment.
- Gogo-style providers are hardsub/dead for our context.
- License metadata differs between web view and npm metadata observed; verify before copying code.

Probe next:
- Inspect installed package provider list in a temp directory.
- Test only providers that return direct `sources[]`, not just embeds.
- Do not use it as a single dependency without vendoring/fallback because providers rot.

Sources:
- https://github.com/consumet/consumet.ts
- https://www.npmjs.com/package/@consumet/extensions

### 5. AnimePahe - Keep Baseline, Not A Clean Source

Verdict: USABLE and already working.

Why it matters:
- It currently returns direct HLS for our player.
- Confirmed One Piece episode 1 returned 1080p and 720p.
- Good baseline reliability.

Tradeoffs:
- English hardsub is burned in.
- Airing/new title freshness can lag.
- Not ideal for our custom subtitle overlay because burned text remains visible.

Next:
- Keep it as primary fallback while researching clean/raw options.

### 6. AllAnime - Coverage Great, Currently Captcha-Blocked At Source Endpoint

Verdict: RISKY/BLOCKED.

Why it matters:
- It had the best AllAnime-like coverage because it is AllAnime.
- Search still works from the local stack.

Current blocker:
- Episode/source GraphQL returns `NEED_CAPTCHA` for One Piece and Frieren.
- FlareSolverr request.get does not clear that source endpoint from current Docker stack.

Next:
- Only revisit if we research a new AllAnime captcha/session flow.
- Keep breaker behavior so Auto does not waste 15 seconds per request.

### 7. Miruro Backends - Good Intelligence Source, Bad Dependency

Verdict: REJECTED-FOR-PLAYER after implementation probe. The API/HLS path works, but the tested streams are Russian audio, not JP audio.

Why it matters:
- Miruro has historically used provider aliases like AnimePahe (`kiwi`) and AllAnime (`ally`).
- It can reveal which providers survive in frontend aggregator land.

Tradeoffs:
- Depending on Miruro means reverse-engineering another aggregator's encrypted backend.
- If it wraps the same two sources, it adds fragility without adding origin diversity.

Next:
- Use Miruro only as a reconnaissance target and UI reference.
- Do not implement a Miruro scraper unless it reveals a genuinely new origin.

## Subtitle Sync Research Direction

The user's idea is correct: if the video is clean/raw and our subtitles are external, we need automatic timing.

### Recommended Alignment Pipeline

Primary path:
1. Extract audio with ffmpeg from the exact source we will play.
2. First try `ffsubsync` with video/audio as reference and the subtitle file as input.
3. If we already have a correctly-timed JP track for the same video, use that JP subtitle as the reference to align ID/EN tracks.
4. If `ffsubsync` confidence is low or drift is non-linear, try `alass`.
5. Cache synced VTT keyed by provider/source URL/title/episode/subtitle-source hash.

Why:
- `ffsubsync` is MIT, CLI/Docker-friendly, language-agnostic via VAD, and usually fast.
- It supports video/audio references, subtitle references, remote references, multi-segment sync, and quality checks.
- `alass` is built for more flexible dynamic subtitle alignment and split/break handling.

Fallback/advanced path:
- Whisper/faster-whisper or WhisperX can transcribe JP audio, but retiming translated Indonesian/English text against Japanese speech is harder.
- Forced aligners like `aeneas` need audio plus same-language text; Indonesian/English subtitles against Japanese audio are a poor match.
- `aeneas` is AGPLv3 and old, which is awkward for a hosted service.
- `subaligner` is MIT and promising, but it is heavier Python/ML infrastructure.

Sources:
- https://github.com/smacke/ffsubsync
- https://github.com/kaegi/alass
- https://github.com/baxtree/subaligner
- https://github.com/readbeyond/aeneas

## Best Current Answer

Best clean/raw JP-audio option to validate next:
- `AniLibria` first, because it is structured/API-like and may avoid English hardsubs.

Best quality/raw long-term option:
- `Nyaa/AnimeTosho release pipeline`, but only if we accept torrent/cache architecture.

Best overall reliability right now:
- `AnimePahe`, because it already works through our source-service.

Best soft-sub shape if it still works:
- `Aniwatch/HiAnime forks`, but this must be live-probed because the upstream ecosystem appears dead or unstable.

Most important engineering next step:
- Build a safe `provider-probe` script that records only JSON summaries: status, source count, subtitle count, video host, subtitle host, and error class. Do not write full HTML/JS output to disk.

## Suggested Probe Order

1. AniLibria API probe.
2. Aniwatch/HiAnime fork probe in disposable script.
3. AnimeTosho subtitle/release metadata probe.
4. Consumet installed-provider inventory and smoke test.
5. Miruro provider reconnaissance only if the above fails.

## Implementation Update

- `aniliberty` provider is implemented in `services/source-service/src/providers/aniliberty.ts`.
- `hianime` provider is implemented in `services/source-service/src/providers/hianime.ts` using the existing `aniwatch` dependency.
- `/status` now reports both Auto providers and all available forced providers.
- `/track` proxies provider-returned subtitle URLs through our origin for soft-sub providers.
- Frontend server picker now shows Auto, AllAnime, AnimePahe, and HiAnime. AniLiberty was removed because it is not JP audio.
- Verified locally: AniLiberty resolves Frieren ep1 to direct HLS 1080p/720p/480p, but the stream is Russian audio and is not suitable for the normal player.
- Verified locally: HiAnime still fails on this network with `getAnimeSearchResults: fetchError` and should be treated as VPS-gated.

## Open Questions

- AniLibria/AniLiberty should remain research-only unless a JP-audio track can be proven per release.
- Are AniLibria CDN streams reachable from Indonesia without special headers?
- Can AnimeTosho/Nyaa be made acceptable for on-demand UX, or only for cached library mode?
- Does any HiAnime fork still return real VTT subtitles after the March 2026 shutdown wave?
- Should we prioritize clean video even with weaker catalog, or hardsub video with stronger coverage plus subtitle overlay?
