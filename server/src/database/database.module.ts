/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { Module, Global, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { count } from 'drizzle-orm';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';
import { sqliteReminders as remindersTable } from './schema';
import { DRIZZLE_DB, JOBS_TABLE, REMINDERS_TABLE, FLASHCARD_CACHE_TABLE, FLASHCARD_REVIEWS_TABLE, USER_FLASHCARDS_TABLE, HIDDEN_FLASHCARDS_TABLE } from './database.constants';

export type DrizzleDb = any;

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

  CREATE TABLE IF NOT EXISTS flashcard_reviews (
    cardId      TEXT PRIMARY KEY,
    noteId      TEXT NOT NULL,
    isUserCard  INTEGER NOT NULL DEFAULT 0,
    easeFactor  TEXT NOT NULL DEFAULT '2.5',
    interval    INTEGER NOT NULL DEFAULT 0,
    repetitions INTEGER NOT NULL DEFAULT 0,
    nextReviewAt TEXT,
    lastReviewAt TEXT,
    lastRating  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_note_id ON flashcard_reviews(noteId);
  CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_next_review ON flashcard_reviews(nextReviewAt);

  CREATE TABLE IF NOT EXISTS user_flashcards (
    id          TEXT PRIMARY KEY,
    noteId      TEXT NOT NULL,
    prompt      TEXT NOT NULL,
    lesson      TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'concept',
    createdAt   TEXT NOT NULL,
    updatedAt   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_user_flashcards_note_id ON user_flashcards(noteId);

  CREATE TABLE IF NOT EXISTS hidden_flashcards (
    cardId      TEXT PRIMARY KEY,
    createdAt   TEXT NOT NULL
  );
`;

const PG_DDL = `
  CREATE TABLE IF NOT EXISTS jobs (
    id          TEXT    PRIMARY KEY,
    status      TEXT    NOT NULL,
    mode        TEXT    NOT NULL,
    topic       TEXT    NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TEXT    NOT NULL,
    "startedAt"   TEXT,
    "finishedAt"  TEXT,
    "nextRunAt"   TEXT,
    error       TEXT,
    payload     TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_jobs_status_next_run ON jobs(status, "nextRunAt");
  CREATE INDEX IF NOT EXISTS idx_jobs_created_at      ON jobs("createdAt");

  CREATE TABLE IF NOT EXISTS reminders (
    id          TEXT PRIMARY KEY,
    "noteId"      TEXT NOT NULL,
    "remindAt"    TEXT NOT NULL,
    message     TEXT NOT NULL DEFAULT '',
    "createdAt"   TEXT NOT NULL,
    "completedAt" TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_note_id      ON reminders("noteId");
  CREATE INDEX IF NOT EXISTS idx_reminders_remind_at    ON reminders("remindAt");
  CREATE INDEX IF NOT EXISTS idx_reminders_completed_at ON reminders("completedAt");

  CREATE TABLE IF NOT EXISTS flashcard_cache (
    "noteId"      TEXT PRIMARY KEY,
    hash        TEXT NOT NULL,
    cards       TEXT NOT NULL,
    "generatedAt" TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_flashcard_cache_hash ON flashcard_cache(hash);

  CREATE TABLE IF NOT EXISTS flashcard_reviews (
    "cardId"      TEXT PRIMARY KEY,
    "noteId"      TEXT NOT NULL,
    "isUserCard"  INTEGER NOT NULL DEFAULT 0,
    "easeFactor"  TEXT NOT NULL DEFAULT '2.5',
    "interval"    INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "nextReviewAt" TEXT,
    "lastReviewAt" TEXT,
    "lastRating"  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_note_id ON flashcard_reviews("noteId");
  CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_next_review ON flashcard_reviews("nextReviewAt");

  CREATE TABLE IF NOT EXISTS user_flashcards (
    "id"          TEXT PRIMARY KEY,
    "noteId"      TEXT NOT NULL,
    prompt      TEXT NOT NULL,
    lesson      TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'concept',
    "createdAt"   TEXT NOT NULL,
    "updatedAt"   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_user_flashcards_note_id ON user_flashcards("noteId");

  CREATE TABLE IF NOT EXISTS hidden_flashcards (
    "cardId"      TEXT PRIMARY KEY,
    "createdAt"   TEXT NOT NULL
  );
`;

const drizzleProvider = {
  provide: DRIZZLE_DB,
  inject: [ConfigService],
  useFactory: async (config: ConfigService): Promise<DrizzleDb | null> => {
    const readOnly = config.get<boolean>('readOnly');
    if (readOnly) return null;

    const dialect = config.get<string>('databaseDialect') || 'sqlite';

    if (dialect === 'postgres') {
      const dbUrl = config.get<string>('databaseUrl');
      if (!dbUrl) {
        throw new Error('Database URL is required when using PostgreSQL dialect (--db-url or DATABASE_URL)');
      }
      const pool = new Pool({ connectionString: dbUrl });
      await pool.query(PG_DDL);
      return drizzlePg(pool, { schema });
    } else {
      const appDbPath = config.get<string>('appDbPath');
      mkdirSync(dirname(appDbPath), { recursive: true });

      const sqlite = new Database(appDbPath);
      sqlite.exec(DDL);

      return drizzleSqlite(sqlite, { schema });
    }
  },
};

const jobsTableProvider = {
  provide: JOBS_TABLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dialect = config.get<string>('databaseDialect') || 'sqlite';
    return dialect === 'postgres' ? schema.pgJobs : schema.sqliteJobs;
  },
};

const remindersTableProvider = {
  provide: REMINDERS_TABLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dialect = config.get<string>('databaseDialect') || 'sqlite';
    return dialect === 'postgres' ? schema.pgReminders : schema.sqliteReminders;
  },
};

const flashcardCacheTableProvider = {
  provide: FLASHCARD_CACHE_TABLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dialect = config.get<string>('databaseDialect') || 'sqlite';
    return dialect === 'postgres' ? schema.pgFlashcardCache : schema.sqliteFlashcardCache;
  },
};

const flashcardReviewsTableProvider = {
  provide: FLASHCARD_REVIEWS_TABLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dialect = config.get<string>('databaseDialect') || 'sqlite';
    return dialect === 'postgres' ? schema.sqliteFlashcardReviewsPg : schema.sqliteFlashcardReviews;
  },
};

const userFlashcardsTableProvider = {
  provide: USER_FLASHCARDS_TABLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dialect = config.get<string>('databaseDialect') || 'sqlite';
    return dialect === 'postgres' ? schema.pgUserFlashcards : schema.sqliteUserFlashcards;
  },
};

const hiddenFlashcardsTableProvider = {
  provide: HIDDEN_FLASHCARDS_TABLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dialect = config.get<string>('databaseDialect') || 'sqlite';
    return dialect === 'postgres' ? schema.pgHiddenFlashcards : schema.sqliteHiddenFlashcards;
  },
};

@Global()
@Module({
  providers: [
    drizzleProvider,
    jobsTableProvider,
    remindersTableProvider,
    flashcardCacheTableProvider,
    flashcardReviewsTableProvider,
    userFlashcardsTableProvider,
    hiddenFlashcardsTableProvider,
  ],
  exports: [
    DRIZZLE_DB,
    JOBS_TABLE,
    REMINDERS_TABLE,
    FLASHCARD_CACHE_TABLE,
    FLASHCARD_REVIEWS_TABLE,
    USER_FLASHCARDS_TABLE,
    HIDDEN_FLASHCARDS_TABLE,
  ],
})
export class DatabaseModule implements OnModuleInit {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb | null,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (!this.db) return;
    const dialect = this.config.get<string>('databaseDialect') || 'sqlite';
    if (dialect === 'postgres') return;

    const remindersDbPath = this.config.get<string>('remindersDbPath');
    this.migrateReminders(remindersDbPath);
  }

  private migrateReminders(remindersDbPath: string): void {
    if (!existsSync(remindersDbPath)) return;

    try {
      const row = this.db!
        .select({ n: count() })
        .from(remindersTable)
        .get();
      if (row && row.n > 0) return;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to check existing reminders: ${error.message}`);
      return;
    }

    let legacy: InstanceType<typeof Database>;
    try {
      legacy = new Database(remindersDbPath, { readonly: true });
    } catch (err) {
      const error = err as Error;
      this.logger.warn(`Could not open legacy reminders database: ${error.message}`);
      return;
    }

    let rows: any[];
    try {
      rows = legacy.prepare('SELECT * FROM reminders').all();
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to read legacy reminders: ${error.message}`);
      legacy.close();
      return;
    }
    legacy.close();

    if (!rows.length) return;

    try {
      this.db!.transaction((tx) => {
        for (const row of rows) {
          tx.insert(remindersTable)
            .values({
              id: row.id,
              noteId: row.noteId,
              remindAt: row.remindAt,
              message: row.message ?? '',
              createdAt: row.createdAt,
              completedAt: row.completedAt ?? null,
            })
            .onConflictDoNothing()
            .run();
        }
      });
      this.logger.log(`Migrated ${rows.length} reminder(s) from reminders.sqlite → app.sqlite`);
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Failed to migrate reminders: ${error.message}`);
    }
  }
}
