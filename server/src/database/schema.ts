import { sqliteTable, text as sqliteText, integer as sqliteInteger } from 'drizzle-orm/sqlite-core';
import { pgTable, text as pgText, integer as pgInteger } from 'drizzle-orm/pg-core';

// --- SQLite Tables ---
export const sqliteJobs = sqliteTable('jobs', {
  id: sqliteText('id').primaryKey(),
  status: sqliteText('status').notNull(),
  mode: sqliteText('mode').notNull(),
  topic: sqliteText('topic').notNull(),
  attempts: sqliteInteger('attempts').notNull().default(0),
  maxAttempts: sqliteInteger('maxAttempts').notNull().default(0),
  createdAt: sqliteText('createdAt').notNull(),
  startedAt: sqliteText('startedAt'),
  finishedAt: sqliteText('finishedAt'),
  nextRunAt: sqliteText('nextRunAt'),
  error: sqliteText('error'),
  payload: sqliteText('payload').notNull(),
});

export const sqliteReminders = sqliteTable('reminders', {
  id: sqliteText('id').primaryKey(),
  noteId: sqliteText('noteId').notNull(),
  remindAt: sqliteText('remindAt').notNull(),
  message: sqliteText('message').notNull().default(''),
  createdAt: sqliteText('createdAt').notNull(),
  completedAt: sqliteText('completedAt'),
});

export const sqliteFlashcardCache = sqliteTable('flashcard_cache', {
  noteId: sqliteText('noteId').primaryKey(),
  hash: sqliteText('hash').notNull(),
  cards: sqliteText('cards').notNull(),
  generatedAt: sqliteText('generatedAt').notNull(),
});

// --- PostgreSQL Tables ---
export const pgJobs = pgTable('jobs', {
  id: pgText('id').primaryKey(),
  status: pgText('status').notNull(),
  mode: pgText('mode').notNull(),
  topic: pgText('topic').notNull(),
  attempts: pgInteger('attempts').notNull().default(0),
  maxAttempts: pgInteger('maxAttempts').notNull().default(0),
  createdAt: pgText('createdAt').notNull(),
  startedAt: pgText('startedAt'),
  finishedAt: pgText('finishedAt'),
  nextRunAt: pgText('nextRunAt'),
  error: pgText('error'),
  payload: pgText('payload').notNull(),
});

export const pgReminders = pgTable('reminders', {
  id: pgText('id').primaryKey(),
  noteId: pgText('noteId').notNull(),
  remindAt: pgText('remindAt').notNull(),
  message: pgText('message').notNull().default(''),
  createdAt: pgText('createdAt').notNull(),
  completedAt: pgText('completedAt'),
});

export const pgFlashcardCache = pgTable('flashcard_cache', {
  noteId: pgText('noteId').primaryKey(),
  hash: pgText('hash').notNull(),
  cards: pgText('cards').notNull(),
  generatedAt: pgText('generatedAt').notNull(),
});
