# CLAUDE.md — project guidance for animeflix (okashiina/animeflix-illa fork)

These instructions are mandatory. Follow them every session.

## 1. Always refer to the streaming roadmap
Before doing ANY work on the video/streaming pipeline (sources, providers, player,
proxy, subtitles, hosting), READ and follow **[docs/STREAMING-ROADMAP.md](docs/STREAMING-ROADMAP.md)**.
Keep that file updated when phases progress or decisions change — it is the source
of truth for the self-hosted (Option B) plan and its anti-fragility SOP.

## 2. Mandatory skills by context
Invoke these skills (Skill tool) before/while doing the matching work — not optional:

- **UI / UX work** (any redesign, rework, restyle, new component/page, layout,
  visual polish): ALWAYS use `/impeccable`, `/ui-ux-pro-max`, and `/frontend-design`.
  Add `/taste-skill` or `/soft-skill` for visual-taste passes.
- **Scraping / anti-bot / browser automation** (Option B source-service, provider
  extractors, Cloudflare/DDoS-Guard work): use `/playwright-cli` and `/web-scraping`.
- **Copy / branding / marketing wording** (any user-facing UI copy, taglines,
  headlines, CTAs, section labels, microcopy, brand voice): ALWAYS use
  `/brand-copywriter` together with `/brand` and `/stop-slop`. Rules: copy is in
  English (Indonesian only for video subtitles), brand-voiced (Bocchi / Kessoku
  Band, "dark, cute, a little rock", stage metaphor), show-don't-tell with concrete
  detail, no AI-slop / banned phrases, no em dashes. Don't claim unbuilt features.

## 3. Working style (from user feedback)
- **Verify before claiming done.** Run `tsc`/`eslint`/build and check actual config
  before saying something works. When you genuinely can't verify (e.g. a third-party
  embed iframe playing in a real browser), say so explicitly — state what you did
  verify vs. what still needs the user's check. Don't imply it's confirmed.
- **NEVER commit without explicit approval.** Build and edit freely, run the checks,
  show what changed — then STOP and WAIT. Do not run `git commit` (or push / open a
  PR / merge) until the user explicitly tells you to, not even for small or
  "obviously done" changes. The user's word is the only trigger. No auto-commits.

## 4. Branching & PR workflow (PPRM) — shared repo, USER-TRIGGERED
This is a **shared project with a collaborator**, so traceability matters. Do NOT
commit straight to `main`, and per §3 do NOT commit / push / PR / merge at all until
the user explicitly says so. PPRM is a **manual gate**: build on a feature branch,
then WAIT for the go-ahead. Once the user gives it, every finished feature or fix
follows **PPRM**:

1. **Branch** off up-to-date `main`: `git checkout main && git pull`, then
   `git checkout -b <type>/<slug>` (`feat/…`, `fix/…`, `docs/…`, `chore/…`).
2. Commit there (small, focused commits). End every commit with the trailer:
   `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
3. **Push** the branch: `git push -u origin <branch>`.
4. **Pull Request** via the gh CLI: `gh pr create` with a clear title + body
   (what/why, how verified). End the PR body with the Claude / Generated-with trailer.
5. **Merge** into `main` (`gh pr merge --squash --delete-branch`) once it is green and
   verified. `main` must always stay releasable (Railway auto-deploys every push to it).

**Independent features may be built in parallel** (separate branches / git worktrees),
but keep each branch's file set disjoint so merges stay conflict-free, and never add a
dependency in a feature branch without flagging the lockfile change.

**Per-feature "done" checklist** (before opening the PR):
- `tsc -p frontend --noEmit` clean + `next lint` clean (run from the `frontend` dir).
- **Run a mobile + PWA audit (Android + iOS) and resolve every blocker.** MANDATORY
  whenever the diff touches any UI surface, the service worker, the manifest,
  viewport/layout, gestures, push, or media. The site is mobile-first + an
  installable PWA, so desktop-passing is not enough — this gate exists so a
  phone-only break (iOS `100vh`, push-in-installed-PWA, native fullscreen,
  long-press, sub-44px tap targets, safe-area) is caught here instead of after
  merge, avoiding a re-PPRM. The `/mobile-pwa-audit` skill runs this (fans out an
  Android lens + an iOS lens against a PWA-safe standard). Skip only when the diff
  is purely backend/non-UI (say so).
- In-browser smoke check of the actual change (say what you verified vs. couldn't).
- Update [docs/STREAMING-ROADMAP.md](docs/STREAMING-ROADMAP.md),
  [docs/COMPETITIVE-ANALYSIS.md](docs/COMPETITIVE-ANALYSIS.md), and memory to mark it shipped.

## 5. Project context (quick orientation)
- Next.js + Turborepo monorepo (`frontend`, `packages/*`). Deploys on Railway
  project "anime-happy" (GitHub-connected, watch paths cleared, Dockerfile build).
- The old GogoAnime source is permanently dead. Video currently uses a **third-party
  embed-iframe switcher** ([frontend/utility/embedProviders.ts](frontend/utility/embedProviders.ts) +
  `EmbedPlayer.tsx`) — this stays as the automatic fallback even after Option B.
- Long-term direction: self-host the video pipeline + redesign the UI in-repo
  (see the roadmap). Willing to move the source-service off Railway to a VPS.
