#!/usr/bin/env node
// Free, stable manhwatop RELAY for prod (Railway).
//
// WHY a relay instead of a proxy: a CONNECT proxy only tunnels bytes, so the
// Railway container still does the TLS handshake with manhwatop — and Cloudflare
// blocks the Linux-container curl's TLS fingerprint even from a residential IP.
// Here THIS machine does the actual fetch (your curl already passes Cloudflare),
// then hands the bytes to Railway. The container never touches manhwatop's TLS.
//
// Exposed over an ngrok HTTP tunnel on a FREE STATIC DOMAIN, so:
//   - no credit card (the card requirement was only for ngrok TCP endpoints),
//   - the address never changes -> set the Railway vars ONCE, no redeploy churn.
//
// Setup (see README.md): reserve your free static domain at
// https://dashboard.ngrok.com/domains, then put it in NGROK_DOMAIN below (or the
// NGROK_DOMAIN env var). Run:  node relay.mjs
// It prints the two variables to set on Railway, once.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// --- config ----------------------------------------------------------------
const PORT = Number(process.env.RELAY_PORT) || 1080;
// Your free ngrok static domain, e.g. 'kessoku-pizza.ngrok-free.app'.
// Reserve one (free) at https://dashboard.ngrok.com/domains.
const NGROK_DOMAIN = process.env.NGROK_DOMAIN || '';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(here, 'relay-state.json');

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    return {};
  }
}
const state = loadState();
if (!state.key) {
  state.key = crypto.randomBytes(18).toString('hex');
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}
const KEY = state.key;

function log(msg) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] ${msg}`);
}

// ponytail: keeping the process alive on an uncaught error is a pragmatic
// backstop so a single bad request can't take the relay down — it is NOT a
// substitute for fixing a real bug. Pair with relay-supervisor.mjs for hard
// crashes this can't catch. Errors are logged, not swallowed silently.
process.on('uncaughtException', (e) => {
  log(`uncaughtException (kept alive): ${e?.stack || e}`);
});
process.on('unhandledRejection', (e) => {
  log(`unhandledRejection (kept alive): ${e?.stack || e}`);
});

// Only relay manhwatop URLs, and only with the shared key — so the public ngrok
// URL can't be abused as an open fetcher.
function allowedTarget(raw) {
  try {
    const u = new URL(raw);
    return (
      u.protocol === 'https:' &&
      (u.hostname === 'manhwatop.com' || u.hostname.endsWith('.manhwatop.com'))
    );
  } catch {
    return false;
  }
}

const server = http.createServer((req, res) => {
  // Wrap the whole handler so a transient per-request error returns a 5xx
  // instead of throwing out into uncaughtException and risking the process.
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200);
      res.end('ok');
      return;
    }
    if (url.pathname !== '/f') {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.headers['x-relay-key'] !== KEY) {
      res.writeHead(403);
      res.end('forbidden');
      return;
    }
    const target = url.searchParams.get('u') || '';
    if (!allowedTarget(target)) {
      res.writeHead(400);
      res.end('bad target');
      return;
    }

    log(`fetch ${target.slice(0, 90)}`);
    // This machine's curl does the real request (passes Cloudflare). Pipe raw
    // bytes back; the caller sets its own Content-Type (HTML vs image).
    const proc = spawn(
      'curl',
      [
        '-s',
        '-L',
        '--compressed',
        '--max-time',
        '30',
        '-A',
        UA,
        '-H',
        'Referer: https://manhwatop.com/',
        target,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );
    // If curl can't be spawned at all (e.g. ENOENT: curl not on PATH), answer
    // 502 instead of letting the error event throw.
    proc.on('error', (e) => {
      log(`curl spawn failed: ${e?.message || e}`);
      if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' });
      if (!res.writableEnded) res.end('upstream fetch failed');
    });
    // Send the 200 only once curl actually started (the 'spawn' event), so a
    // spawn failure can still return 502. Works for empty bodies too, since we
    // don't wait for the first byte.
    proc.on('spawn', () => {
      if (!res.headersSent) {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      }
    });
    proc.stdout.on('error', () => {
      if (!res.writableEnded) res.end();
    });
    proc.stdout.pipe(res);
    res.on('close', () => proc.kill());
    // A broken client socket shouldn't bubble up as an uncaught error.
    res.on('error', () => proc.kill());
  } catch (e) {
    log(`request handler error: ${e?.stack || e}`);
    if (!res.headersSent) res.writeHead(500);
    if (!res.writableEnded) res.end();
  }
});

// Surface listen/runtime socket errors (e.g. EADDRINUSE) clearly instead of
// crashing the process opaquely.
server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    log(`!! port ${PORT} already in use — is another relay running?`);
  } else {
    log(`server error: ${e?.stack || e}`);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  log(`relay listening on 127.0.0.1:${PORT}`);
  if (!NGROK_DOMAIN) {
    log('!! NGROK_DOMAIN is not set. Reserve a free static domain at');
    log('!! https://dashboard.ngrok.com/domains, then set it at the top of');
    log('!! relay.mjs (or the NGROK_DOMAIN env var) and restart.');
    return;
  }
  startNgrok();
});

let ngrokProc = null;
function startNgrok() {
  if (ngrokProc) return;
  log(`starting ngrok http on https://${NGROK_DOMAIN} ...`);
  ngrokProc = spawn('ngrok', ['http', `--domain=${NGROK_DOMAIN}`, String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const surface = (b) => {
    const s = b.toString();
    if (/lvl=(error|crit|warn)|ERR_NGROK|authtoken|account/i.test(s)) {
      log('ngrok: ' + s.replace(/\s+/g, ' ').trim().slice(0, 240));
    }
  };
  ngrokProc.stdout.on('data', surface);
  ngrokProc.stderr.on('data', surface);
  ngrokProc.on('exit', (code) => {
    log(`ngrok exited (code ${code}); will respawn in 5s`);
    ngrokProc = null;
    setTimeout(startNgrok, 5000);
  });
  // Give ngrok a moment, then print exactly what to put on Railway.
  setTimeout(() => {
    log('================= SET THESE ON RAILWAY (once) =================');
    log(`MANHWATOP_RELAY=https://${NGROK_DOMAIN}`);
    log(`MANHWATOP_RELAY_KEY=${KEY}`);
    log('==============================================================');
    log('Then `railway redeploy` once. After that, just keep this running.');
  }, 3000);
}

function shutdown() {
  if (ngrokProc) ngrokProc.kill();
  server.close();
  log('stopped');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
