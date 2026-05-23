import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Durable job queue. Scheduler fields are first-class columns so the queue
 * processor can filter by status and nextRunAt without JSON parsing.
 * The full job payload is also serialised as JSON for forward compatibility.
 */
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  mode: text('mode').notNull(),
  topic: text('topic').notNull(),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('maxAttempts').notNull().default(0),
  createdAt: text('createdAt').notNull(),
  startedAt: text('startedAt'),
  finishedAt: text('finishedAt'),
  nextRunAt: text('nextRunAt'),
  error: text('error'),
  payload: text('payload').notNull(),
});

/**
 * Reminders tied to individual notes. Previously stored in reminders.sqlite;
 * consolidated here so a single database file contains all app state.
 */
export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  remindAt: text('remindAt').notNull(),
  message: text('message').notNull().default(''),
  createdAt: text('createdAt').notNull(),
  completedAt: text('completedAt'),
});

/**
 * AI-generated flashcard cache keyed by note id. Cards are stored as a JSON
 * array so they can be replaced atomically with no schema churn when the
 * card shape evolves.
 */
export const flashcardCache = sqliteTable('flashcard_cache', {
  noteId: text('noteId').primaryKey(),
  hash: text('hash').notNull(),
  cards: text('cards').notNull(),
  generatedAt: text('generatedAt').notNull(),
});
