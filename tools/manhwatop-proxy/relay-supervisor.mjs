#!/usr/bin/env node
// Auto-restarting wrapper for relay.mjs.
//
// relay.mjs already survives transient errors (uncaughtException backstop), but
// a HARD crash (OOM, native abort, killed child taking it down) still exits the
// process. This tiny supervisor respawns it so the relay stays up unattended.
//
// Run THIS instead of relay.mjs for resilience:  node relay-supervisor.mjs
// Passes NGROK_DOMAIN / RELAY_PORT straight through via the inherited env.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const relay = path.join(here, 'relay.mjs');

// ponytail: fixed 3s backoff (no exponential ramp). Enough to avoid a tight
// crash-loop; upgrade to exponential + cap if a persistent crash spins it.
const BACKOFF_MS = 3000;
let child = null;
let stopping = false;

function start() {
  if (stopping) return;
  child = spawn(process.execPath, [relay], { stdio: 'inherit', env: process.env });
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) return;
    console.log(
      `[supervisor] relay exited (code ${code}, signal ${signal}); ` +
        `restarting in ${BACKOFF_MS / 1000}s`
    );
    setTimeout(start, BACKOFF_MS);
  });
  child.on('error', (e) => {
    console.log(`[supervisor] failed to spawn relay: ${e?.message || e}`);
  });
}

function shutdown() {
  stopping = true;
  if (child) child.kill();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[supervisor] starting relay (auto-restart on crash)');
start();
