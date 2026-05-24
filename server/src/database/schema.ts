import { sqliteTable, text as sqliteText, integer as sqliteInteger, primaryKey as sqlitePrimaryKey } from 'drizzle-orm/sqlite-core';
import { pgTable, text as pgText, integer as pgInteger, primaryKey as pgPrimaryKey } from 'drizzle-orm/pg-core';

// --- SQLite Tables ---
export const sqliteJobs = sqliteTable('jobs', {
  id: sqliteText('id').primaryKey(),
  userId: sqliteText('userId').notNull().default(''),
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
  userId: sqliteText('userId').notNull().default(''),
  noteId: sqliteText('noteId').notNull(),
  remindAt: sqliteText('remindAt').notNull(),
  message: sqliteText('message').notNull().default(''),
  createdAt: sqliteText('createdAt').notNull(),
  completedAt: sqliteText('completedAt'),
});

export const sqliteFlashcardCache = sqliteTable('flashcard_cache', {
  userId: sqliteText('userId').notNull().default(''),
  noteId: sqliteText('noteId').notNull(),
  hash: sqliteText('hash').notNull(),
  cards: sqliteText('cards').notNull(),
  generatedAt: sqliteText('generatedAt').notNull(),
}, (t) => ({
  pk: sqlitePrimaryKey({ columns: [t.userId, t.noteId] }),
}));

/** Per-card spaced repetition review data (SM-2 algorithm). */
export const sqliteFlashcardReviews = sqliteTable('flashcard_reviews', {
  cardId: sqliteText('cardId').primaryKey(),
  userId: sqliteText('userId').notNull().default(''),
  noteId: sqliteText('noteId').notNull(),
  isUserCard: sqliteInteger('isUserCard').notNull().default(0),
  easeFactor: sqliteText('easeFactor').notNull().default('2.5'),
  interval: sqliteInteger('interval').notNull().default(0),
  repetitions: sqliteInteger('repetitions').notNull().default(0),
  nextReviewAt: sqliteText('nextReviewAt'),
  lastReviewAt: sqliteText('lastReviewAt'),
  lastRating: sqliteText('lastRating'),
});
export const sqliteFlashcardReviewsPg = pgTable('flashcard_reviews', {
  cardId: pgText('cardId').primaryKey(),
  userId: pgText('userId').notNull().default(''),
  noteId: pgText('noteId').notNull(),
  isUserCard: pgInteger('isUserCard').notNull().default(0),
  easeFactor: pgText('easeFactor').notNull().default('2.5'),
  interval: pgInteger('interval').notNull().default(0),
  repetitions: pgInteger('repetitions').notNull().default(0),
  nextReviewAt: pgText('nextReviewAt'),
  lastReviewAt: pgText('lastReviewAt'),
  lastRating: pgText('lastRating'),
});

/** User-created flashcards linked to notes. */
export const sqliteUserFlashcards = sqliteTable('user_flashcards', {
  id: sqliteText('id').primaryKey(),
  userId: sqliteText('userId').notNull().default(''),
  noteId: sqliteText('noteId').notNull(),
  prompt: sqliteText('prompt').notNull(),
  lesson: sqliteText('lesson').notNull(),
  kind: sqliteText('kind').notNull().default('concept'),
  createdAt: sqliteText('createdAt').notNull(),
  updatedAt: sqliteText('updatedAt').notNull(),
});
export const pgUserFlashcards = pgTable('user_flashcards', {
  id: pgText('id').primaryKey(),
  userId: pgText('userId').notNull().default(''),
  noteId: pgText('noteId').notNull(),
  prompt: pgText('prompt').notNull(),
  lesson: pgText('lesson').notNull(),
  kind: pgText('kind').notNull().default('concept'),
  createdAt: pgText('createdAt').notNull(),
  updatedAt: pgText('updatedAt').notNull(),
});

/** Hidden/dismissed flashcards (either AI-generated or user-created). */
export const sqliteHiddenFlashcards = sqliteTable('hidden_flashcards', {
  cardId: sqliteText('cardId').primaryKey(),
  userId: sqliteText('userId').notNull().default(''),
  createdAt: sqliteText('createdAt').notNull(),
});
export const pgHiddenFlashcards = pgTable('hidden_flashcards', {
  cardId: pgText('cardId').primaryKey(),
  userId: pgText('userId').notNull().default(''),
  createdAt: pgText('createdAt').notNull(),
});

// --- PostgreSQL Tables ---
export const pgJobs = pgTable('jobs', {
  id: pgText('id').primaryKey(),
  userId: pgText('userId').notNull().default(''),
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
  userId: pgText('userId').notNull().default(''),
  noteId: pgText('noteId').notNull(),
  remindAt: pgText('remindAt').notNull(),
  message: pgText('message').notNull().default(''),
  createdAt: pgText('createdAt').notNull(),
  completedAt: pgText('completedAt'),
});

export const pgFlashcardCache = pgTable('flashcard_cache', {
  userId: pgText('userId').notNull().default(''),
  noteId: pgText('noteId').notNull(),
  hash: pgText('hash').notNull(),
  cards: pgText('cards').notNull(),
  generatedAt: pgText('generatedAt').notNull(),
}, (t) => ({
  pk: pgPrimaryKey({ columns: [t.userId, t.noteId] }),
}));
