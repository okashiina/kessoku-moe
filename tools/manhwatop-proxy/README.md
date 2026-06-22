# manhwatop relay (free, for prod)

Makes the Cloudflare-protected manhwatop titles (the Pizza BL, etc.) load on
Railway. **Free** (your own internet + ngrok's free tier, no credit card).

## Why a relay, not a proxy

A CONNECT proxy only tunnels bytes, so the Railway container still does the TLS
handshake with manhwatop — and Cloudflare blocks the Linux container's curl
fingerprint even from a residential IP. So instead, **this machine fetches the
page itself** (your curl passes Cloudflare) and hands the bytes to Railway. The
container never speaks TLS to manhwatop.

`relay.mjs` runs a small HTTP service on `127.0.0.1:1080` (endpoint `/f?u=<url>`,
key-protected, manhwatop-only) and exposes it over an ngrok HTTP tunnel on a
**free static domain** — so the address never changes and you set the Railway
variables only once.

Trade-off: it only works while this machine is awake.

## One-time setup

1. **ngrok** — install + sign in, and reserve a free static domain:
   - `winget install ngrok.ngrok` then `ngrok update` (needs agent >= 3.20)
   - `ngrok config add-authtoken <token>` (dashboard.ngrok.com/get-started/your-authtoken)
   - Reserve your free domain at https://dashboard.ngrok.com/domains (looks like
     `something.ngrok-free.app`). HTTP endpoints need **no credit card**.
2. Put that domain at the top of `relay.mjs` (`NGROK_DOMAIN`) or pass it as the
   `NGROK_DOMAIN` env var.

## Run it

For an **auto-restarting** relay (recommended), run the supervisor — it respawns
`relay.mjs` after a short backoff if it ever hard-crashes:

```powershell
cd C:\Projects\kessoku-moe\tools\manhwatop-proxy
node relay-supervisor.mjs
```

It passes `NGROK_DOMAIN` / `RELAY_PORT` straight through, so set them the same way
you would for `relay.mjs`. You can still run the relay directly without the
supervisor if you prefer:

```powershell
node relay.mjs
```

On first run it prints the two variables to set on Railway, once:

```
MANHWATOP_RELAY=https://<your-domain>.ngrok-free.app
MANHWATOP_RELAY_KEY=<generated key>
```

Set both on the Railway **frontend** service (Variables), remove the old
`MANHWATOP_PROXY` if present, then `railway redeploy` once. After that the address
never changes — just keep `relay.mjs` running whenever someone needs to read.

> The key is generated into `relay-state.json` (gitignored) and stays stable
> across restarts. Keep it private.

## Start automatically at login

Point the autostart at **`relay-supervisor.mjs`** (not `relay.mjs`) so a crash
self-heals:

```powershell
schtasks /create /tn "kessoku-manhwatop-relay" /sc onlogon /rl limited ^
  /tr "node \"C:\Projects\kessoku-moe\tools\manhwatop-proxy\relay-supervisor.mjs\""
```

Remove later: `schtasks /delete /tn "kessoku-manhwatop-relay" /f`

> A local startup launcher (e.g. `relay-launch.vbs`, gitignored) should likewise
> invoke `relay-supervisor.mjs` rather than `relay.mjs` for resilience.

## Notes

- **Awake-only.** Laptop asleep/off = manhwatop titles stop loading in prod (the
  rest of the site is unaffected). For true 24/7 with no machine running, swap to
  a paid residential proxy later and drop this.
- The relay only fetches `*.manhwatop.com` and only with the key, so the public
  ngrok URL can't be abused as an open fetcher.
- No more redeploys on restart: the static domain + key are stable, so the
  Railway variables are set once.
- **Liveness check:** `curl http://127.0.0.1:1080/health` returns `ok` when the
  relay is up (handy for the supervisor / monitoring). `relay.mjs` also logs and
  keeps running on transient per-request errors; `relay-supervisor.mjs` covers the
  hard crashes that can't be caught in-process.
