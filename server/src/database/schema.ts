import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

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

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(),
  noteId: text('noteId').notNull(),
  remindAt: text('remindAt').notNull(),
  message: text('message').notNull().default(''),
  createdAt: text('createdAt').notNull(),
  completedAt: text('completedAt'),
});

export const flashcardCache = sqliteTable('flashcard_cache', {
  noteId: text('noteId').primaryKey(),
  hash: text('hash').notNull(),
  cards: text('cards').notNull(),
  generatedAt: text('generatedAt').notNull(),
});
