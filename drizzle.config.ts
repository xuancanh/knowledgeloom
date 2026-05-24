/**
 * drizzle-kit configuration for local SQLite development.
 *
 * Usage:
 *   npx drizzle-kit push          # sync schema → DB (dev only, no migration files)
 *   npx drizzle-kit studio        # open Drizzle Studio in browser
 *
 * Do NOT use `drizzle-kit push` against production databases.
 * Production migrations run automatically at startup via runSqliteMigrations()
 * in server/src/database/migrator.ts.
 *
 * For PostgreSQL, set DRIZZLE_DB_URL and use dialect: 'postgresql'.
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/src/database/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: './knowledge/app.sqlite',
  },
});
