import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema';

// One shared pg Pool + Drizzle instance, cached on globalThis so Next dev HMR
// (which re-evaluates modules) doesn't leak a new pool every reload. DATABASE_URL
// is server-only / runtime (never NEXT_PUBLIC, never a Docker build arg). When
// it's unset, getDb() returns null and the routes answer 503 — the rest of the
// app (local-first) keeps working with no database at all.

type Db = NodePgDatabase<typeof schema>;

interface DbCache {
  pool?: Pool;
  db?: Db;
}

const g = globalThis as unknown as { kessokuDbCache?: DbCache };
if (!g.kessokuDbCache) g.kessokuDbCache = {};

export const hasDb = (): boolean => Boolean(process.env.DATABASE_URL);

export const getDb = (): Db | null => {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const cache = g.kessokuDbCache as DbCache;
  if (cache.db) return cache.db;

  const max = Number(process.env.DATABASE_POOL_MAX) || 8;
  const pool = new Pool({
    connectionString: url,
    max,
    // Managed Postgres (Neon, Railway) requires TLS; accept their chain without
    // pinning a CA so the connection just works across providers.
    ssl: /sslmode=require|neon\.tech|\.railway\./.test(url)
      ? { rejectUnauthorized: false }
      : undefined,
  });
  pool.on('error', (err) => {
    // A dropped idle connection must never crash the server; the pool reconnects.
    // eslint-disable-next-line no-console
    console.error('[db] pool error', err.message);
  });

  cache.pool = pool;
  cache.db = drizzle(pool, { schema });
  return cache.db;
};

export { schema };
