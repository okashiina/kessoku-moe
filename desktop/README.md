# kessoku moe desktop

The Windows app: kessoku moe in its own window, with a Start menu entry, a
desktop shortcut and quiet background updates. It installs from a regular
`kessoku-moe-Setup-<version>.exe`.

The app is an [Electron](https://www.electronjs.org) shell around the hosted
site (`https://kessoku-moe.cc`), not a bundled copy of it. The catalog, AniList
sign-in, the companion and the source service all run on the server, so the
desktop app gets every web release the moment it deploys, and the installer
only has to change when the shell itself does.

## What the shell adds

- **Its own titlebar.** Back, forward, reload and home next to the wordmark,
  the page title in the middle and the native Windows caption buttons (snap
  layouts included) tinted to match. A thin pink bar shows page loads.
- **A splash, not a white flash.** The window opens straight onto the animated
  pick logo and stays there until the first page has rendered.
- **An offline screen that fixes itself.** If the server can't be reached, the
  app says so and retries on a backoff (5s, 10s, 20s, then every 30s), or
  immediately when the connection comes back.
- **Pop-ups stay out.** Links the page opens in a new tab go to your browser.
  Pop-ups and redirects coming from embedded players are dropped.
- **Real fullscreen.** A player going fullscreen takes the whole window,
  titlebar included. F11 does the same for any page.
- **Stays signed in.** Cookies and local storage live in a persistent profile,
  so your AniList session and watch progress survive restarts.
- **Windows niceties.** Jump list shortcuts (Home, Airing schedule, My list,
  Manga) on the taskbar icon, mouse back/forward buttons, media keys, a
  remembered window size and position, and `kessoku-moe://` links
  (`kessoku-moe://anime/21` opens that page in the app).
- **Updates in the background.** The app checks GitHub Releases at launch and
  every six hours, downloads quietly, then shows a "ready, restart" pill in the
  titlebar. Updates also install on the next quit.

### Shortcuts

| Keys | Action |
| --- | --- |
| `Alt+Left` / `Alt+Right` | Back / forward |
| `Alt+Home` | Home |
| `Ctrl+R` / `F5` | Reload (`Ctrl+Shift+R` skips the cache) |
| `F11` | Fullscreen |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Zoom in / out / reset |
| `Ctrl+Shift+I` / `F12` | Developer tools |

## Develop

The desktop app has its own `package.json` and lockfile and is not part of the
Yarn workspaces, so Electron never lands in the web app's install or Docker
image.

```bash
cd desktop
npm install
npm start          # opens the app against https://kessoku-moe.cc
npm run dev        # same, against a local `yarn dev` on http://localhost:3000
```

`KESSOKU_URL` points the app anywhere else: `KESSOKU_URL=https://staging.example npm start`.

## Build the installer

```bash
cd desktop
npm run dist       # → dist/kessoku-moe-Setup-<version>.exe
```

On Windows that is all it needs. On Linux or macOS, electron-builder runs NSIS
under Wine, so install Wine (64- and 32-bit) first.

The art in `build/` (icon, installer sidebar and header) is generated from
`frontend/public/kessoku-moe-appicon.svg` and the brand fonts. Regenerate it
after a logo change with `npm run assets` (needs Playwright's Chromium and
ImageMagick).

## Release

The [Desktop workflow](../.github/workflows/desktop.yml) builds the installer
on every pull request and push that touches `desktop/`, and keeps the `.exe`
as a downloadable workflow artifact.

To ship a version that installed apps update to:

1. Bump `version` in `desktop/package.json` (e.g. `1.0.1`) and merge it.
2. Tag that commit `desktop-v1.0.1` and push the tag.

The workflow then publishes a GitHub release with the installer, its blockmap
and `latest.yml`. Installed apps read `latest.yml` from the repository's latest
release, so keep desktop releases as the "latest" release of this repo.

### Code signing

Without a certificate the installer is unsigned, and Windows SmartScreen shows
"Windows protected your PC" on first run (More info → Run anyway). To sign,
add a code-signing certificate as repository secrets: `WIN_CSC_LINK` (the
`.pfx`, base64-encoded) and `WIN_CSC_KEY_PASSWORD`. The workflow picks them up
automatically.

## Known limits

- **Web push notifications** don't reach the desktop app: Electron has no push
  service behind `PushManager`. In-page notifications still work.
- **Offline viewing** isn't a thing yet; the app needs the server.
