/**
 * DatabaseModule — bootstraps a single Drizzle ORM connection for the process.
 *
 * Architecture notes:
 *  - Marked @Global() so every module that imports DatabaseModule inherits
 *    the DRIZZLE_DB provider without having to re-import this module in every
 *    feature module. This is the pattern NestJS recommends for shared
 *    infrastructure (see NestJS docs: "Global modules").
 *  - Uses a factory provider (useFactory) rather than a class because Drizzle
 *    does not expose an injectable class — it is a factory function that
 *    returns a typed query builder instance.
 *  - DDL is run inline during initialisation. We do not use a migration
 *    framework because the schema is append-only for this local-first app;
 *    CREATE TABLE IF NOT EXISTS is safe to run on every boot.
 *  - The reminders table was previously in a separate reminders.sqlite sidecar.
 *    DatabaseModule consolidates everything into app.sqlite and handles the
 *    one-time row migration transparently.
 *
 * @module DatabaseModule
 */
import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';
import { DRIZZLE_DB } from './database.constants';

/** Concrete type for the Drizzle query builder instance. */
export type DrizzleDb = BetterSQLite3Database<typeof schema>;

const DDL = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT    PRIMARY KEY,
    status      TEXT    NOT NULL,
    mode        TEXT    NOT NULL,
    topic       TEXT    NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    maxAttempts INTEGER NOT NULL DEFAULT 0,
    createdAt   TEXT    NOT NULL,
    startedAt   TEXT,
    finishedAt  TEXT,
    nextRunAt   TEXT,
    error       TEXT,
    payload     TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_status_next_run ON jobs(status, nextRunAt);
  CREATE INDEX IF NOT EXISTS idx_jobs_created_at      ON jobs(createdAt);

  CREATE TABLE IF NOT EXISTS reminders (
    id          TEXT PRIMARY KEY,
    noteId      TEXT NOT NULL,
    remindAt    TEXT NOT NULL,
    message     TEXT NOT NULL DEFAULT '',
    createdAt   TEXT NOT NULL,
    completedAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_note_id      ON reminders(noteId);
  CREATE INDEX IF NOT EXISTS idx_reminders_remind_at    ON reminders(remindAt);
  CREATE INDEX IF NOT EXISTS idx_reminders_completed_at ON reminders(completedAt);

  CREATE TABLE IF NOT EXISTS flashcard_cache (
    noteId      TEXT PRIMARY KEY,
    hash        TEXT NOT NULL,
    cards       TEXT NOT NULL,
    generatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_flashcard_cache_hash ON flashcard_cache(hash);
`;

/**
 * Factory provider that opens the SQLite database, runs DDL, and returns a
 * Drizzle instance. Returns null in read-only deployments so repositories can
 * guard against it without throwing at startup.
 */
const drizzleProvider = {
  provide: DRIZZLE_DB,
  inject: [ConfigService],
  useFactory: (config: ConfigService): DrizzleDb | null => {
    const readOnly = config.get<boolean>('readOnly');
    if (readOnly) return null;

    const appDbPath = config.get<string>('appDbPath');
    mkdirSync(dirname(appDbPath), { recursive: true });

    const sqlite = new Database(appDbPath);
    sqlite.exec(DDL);

    // One-time migration: import reminders from the old reminders.sqlite sidecar
    // when the consolidated table is empty and the old file exists.
    const remindersDbPath = config.get<string>('remindersDbPath');
    migrateReminders(sqlite, remindersDbPath);

    return drizzle(sqlite, { schema });
  },
};

function migrateReminders(sqlite: InstanceType<typeof Database>, remindersDbPath: string): void {
  if (!existsSync(remindersDbPath)) return;
  const count = (sqlite.prepare('SELECT COUNT(*) AS n FROM reminders').get() as any).n;
  if (count > 0) return;

  let legacy: InstanceType<typeof Database>;
  try {
    legacy = new Database(remindersDbPath, { readonly: true });
  } catch {
    return;
  }

  let rows: any[];
  try {
    rows = legacy.prepare('SELECT * FROM reminders').all();
  } catch {
    legacy.close();
    return;
  }
  legacy.close();

  if (!rows.length) return;

  const insert = sqlite.prepare(
    'INSERT OR IGNORE INTO reminders (id, noteId, remindAt, message, createdAt, completedAt) VALUES (@id, @noteId, @remindAt, @message, @createdAt, @completedAt)',
  );
  const tx = sqlite.transaction((r: any[]) => { for (const row of r) insert.run(row); });
  tx(rows);
  console.log(`Migrated ${rows.length} reminder(s) from reminders.sqlite → app.sqlite`);
}

@Global()
@Module({
  providers: [drizzleProvider],
  exports: [DRIZZLE_DB],
})
export class DatabaseModule {}
