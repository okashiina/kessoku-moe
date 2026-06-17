// These are dev-only here (the drizzle-kit CLI runs this config; it's never
// bundled into the app), so the extraneous-deps rule doesn't apply.
/* eslint-disable import/no-extraneous-dependencies */
import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';
/* eslint-enable import/no-extraneous-dependencies */

// Load .env.local (and .env) the same way Next does, so `db:generate` /
// `db:migrate` pick up DATABASE_URL from the gitignored env file with nothing
// pasted on the CLI.
loadEnvConfig(process.cwd());

// drizzle-kit reads this for `generate` (SQL from the schema diff, no DB needed)
// and `migrate` (applies to DATABASE_URL). Migrations are committed under
// ./drizzle and run as an explicit, gated step — never from the Docker CMD.

export default defineConfig({
  schema: './utility/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
});
