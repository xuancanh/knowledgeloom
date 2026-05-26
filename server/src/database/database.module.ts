/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * DatabaseModule — bootstraps a single Drizzle ORM connection for the process.
 *
 * Migration strategy (see migrator.ts for full explanation):
 *  - Migrations are tracked in a `__migrations` table inside the same DB.
 *  - Each migration is an idempotent TypeScript function that checks the live
 *    schema (PRAGMA table_info for SQLite, information_schema for PG) before
 *    making any changes. Safe to run on every boot.
 *  - Never use raw DDL + try/catch here — silent error swallowing is how columns
 *    end up missing in production. Always check before acting.
 *
 * Supported backends:
 *  - SQLite (better-sqlite3) — local-first default, DB at KNOWLEDGE_DIR/app.sqlite
 *  - PostgreSQL (node-postgres) — cloud deployments via DATABASE_URL
 */
import { Module, Global, OnModuleInit, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { count } from 'drizzle-orm';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';
import { sqliteReminders as remindersTable } from './schema';
import { runSqliteMigrations, runPgMigrations, migrateLocalNoteFiles } from './migrator';
import { DRIZZLE_DB, JOBS_TABLE, REMINDERS_TABLE, FLASHCARD_CACHE_TABLE, FLASHCARD_REVIEWS_TABLE, USER_FLASHCARDS_TABLE, HIDDEN_FLASHCARDS_TABLE, QUIZ_CACHE_TABLE, QUIZ_REVIEWS_TABLE, QUIZ_HIDDEN_TABLE, NOTE_READS_TABLE, USER_SETTINGS_TABLE } from './database.constants';

/**
 * Drizzle database instance covering both SQLite and PG backends.
 *
 * Intentionally typed as `any` because BetterSQLite3Database and NodePgDatabase
 * have incompatible method signatures (sync vs async, different return types).
 * Repositories narrow the type via dialect-specific code paths (`if (dialect ===
 * 'postgres') { await ... } else { ... .run() }`).
 *
 * A proper typed union would require extracting a shared interface from both
 * Drizzle drivers, which is a breaking change upstream.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DrizzleDb = any;

const drizzleProvider = {
  provide: DRIZZLE_DB,
  inject: [ConfigService],
  useFactory: async (config: ConfigService): Promise<DrizzleDb | null> => {
    const readOnly = config.get<boolean>('readOnly');
    if (readOnly) return null;

    const dialect = config.get<string>('databaseDialect') || 'sqlite';
    const logger = new Logger('DatabaseModule');

    if (dialect === 'postgres') {
      const dbUrl = config.get<string>('databaseUrl');
      if (!dbUrl) {
        throw new Error('DATABASE_URL is required when using PostgreSQL dialect');
      }
      const pool = new Pool({ connectionString: dbUrl });
      await runPgMigrations(pool, logger);
      return drizzlePg(pool, { schema });
    }

    const appDbPath = config.get<string>('appDbPath');
    mkdirSync(dirname(appDbPath), { recursive: true });

    const sqlite = new Database(appDbPath);
    runSqliteMigrations(sqlite, logger);

    return drizzleSqlite(sqlite, { schema });
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

const quizCacheTableProvider = {
  provide: QUIZ_CACHE_TABLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dialect = config.get<string>('databaseDialect') || 'sqlite';
    return dialect === 'postgres' ? schema.pgQuizCache : schema.sqliteQuizCache;
  },
};

const quizReviewsTableProvider = {
  provide: QUIZ_REVIEWS_TABLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dialect = config.get<string>('databaseDialect') || 'sqlite';
    return dialect === 'postgres' ? schema.pgQuizReviews : schema.sqliteQuizReviews;
  },
};

const quizHiddenTableProvider = {
  provide: QUIZ_HIDDEN_TABLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dialect = config.get<string>('databaseDialect') || 'sqlite';
    return dialect === 'postgres' ? schema.pgQuizHidden : schema.sqliteQuizHidden;
  },
};

const noteReadsTableProvider = {
  provide: NOTE_READS_TABLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const _dialect = config.get<string>('databaseDialect') || 'sqlite';
    return schema.sqliteNoteReads;
  },
};

const userSettingsTableProvider = {
  provide: USER_SETTINGS_TABLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const dialect = config.get<string>('databaseDialect') || 'sqlite';
    return dialect === 'postgres' ? schema.pgUserSettings : schema.sqliteUserSettings;
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
    quizCacheTableProvider,
    quizReviewsTableProvider,
    quizHiddenTableProvider,
    noteReadsTableProvider,
    userSettingsTableProvider,
  ],
  exports: [
    DRIZZLE_DB,
    JOBS_TABLE,
    REMINDERS_TABLE,
    FLASHCARD_CACHE_TABLE,
    FLASHCARD_REVIEWS_TABLE,
    USER_FLASHCARDS_TABLE,
    HIDDEN_FLASHCARDS_TABLE,
    QUIZ_CACHE_TABLE,
    QUIZ_REVIEWS_TABLE,
    QUIZ_HIDDEN_TABLE,
    NOTE_READS_TABLE,
    USER_SETTINGS_TABLE,
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

    const knowledgeDir = this.config.get<string>('knowledgeDir');
    migrateLocalNoteFiles(knowledgeDir, this.logger);

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
      this.logger.error(`Failed to check existing reminders: ${(err as Error).message}`);
      return;
    }

    let legacy: InstanceType<typeof Database>;
    try {
      legacy = new Database(remindersDbPath, { readonly: true });
    } catch (err) {
      this.logger.warn(`Could not open legacy reminders database: ${(err as Error).message}`);
      return;
    }

    let rows: any[];
    try {
      rows = legacy.prepare('SELECT * FROM reminders').all();
    } catch (err) {
      this.logger.error(`Failed to read legacy reminders: ${(err as Error).message}`);
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
      this.logger.error(`Failed to migrate reminders: ${(err as Error).message}`);
    }
  }
}
