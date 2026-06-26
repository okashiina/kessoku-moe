import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Central config, all from env with safe defaults. Config-as-data (SOP #7):
// providers / proxy / TTLs / breaker tuning are swappable without code changes.

// Local `npm run dev` does not load `.env` by itself. Docker already injects the
// same file via env_file, but this keeps the laptop/dev path aligned with the
// frontend's NEXT_PUBLIC_SOURCE_SERVICE_URL=http://localhost:8088.
const loadLocalEnv = (): void => {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    const raw = trimmed.slice(eq + 1).trim();
    const value = raw.replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[key] === undefined) process.env[key] = value;
  });
};

loadLocalEnv();
const num = (v: string | undefined, d: number) => (v ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 8080),
  providers: (process.env.PROVIDERS || 'kaa,animepahe,allanime')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  flaresolverrUrl: process.env.FLARESOLVERR_URL || 'http://flaresolverr:8191/v1',
  proxyUrl: process.env.PROXY_URL || '',
  sourceTtlMs: num(process.env.SOURCE_TTL_MS, 15 * 60 * 1000),
  subtitleTtlMs: num(process.env.SUBTITLE_TTL_MS, 24 * 60 * 60 * 1000),
  breakerThreshold: num(process.env.BREAKER_THRESHOLD, 4),
  breakerCooldownMs: num(process.env.BREAKER_COOLDOWN_MS, 2 * 60 * 1000),
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim()),
  // Public origin (scheme+host) used to build /hls, /file, /subs links. Behind a
  // TLS-terminating tunnel (Cloudflare / Tailscale Funnel) req.protocol is plain
  // http, which would emit mixed-content http:// links on an https frontend and
  // get the player blocked. Set this to the public https origin to force it.
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, ''),
  openSubtitlesApiKey: process.env.OPENSUBTITLES_API_KEY || '',
  // External subtitle sources (Phase 3). See docs/SUBTITLE-SOURCING-RESEARCH.md.
  subdlApiKey: process.env.SUBDL_API_KEY || '', // Indonesian (id)
  jimakuApiKey: process.env.JIMAKU_API_KEY || '', // Japanese (ja)
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
} as const;
