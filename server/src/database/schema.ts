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

// --- Quiz tables (SQLite) ---

export const sqliteQuizCache = sqliteTable('quiz_cache', {
  userId: sqliteText('userId').notNull().default(''),
  noteId: sqliteText('noteId').notNull(),
  hash: sqliteText('hash').notNull(),
  questions: sqliteText('questions').notNull(),
  generatedAt: sqliteText('generatedAt').notNull(),
}, (t) => ({
  pk: sqlitePrimaryKey({ columns: [t.userId, t.noteId] }),
}));

export const sqliteQuizReviews = sqliteTable('quiz_reviews', {
  questionId: sqliteText('questionId').primaryKey(),
  userId: sqliteText('userId').notNull().default(''),
  noteId: sqliteText('noteId').notNull(),
  nextReviewAt: sqliteText('nextReviewAt'),
  lastReviewAt: sqliteText('lastReviewAt'),
  lastRating: sqliteText('lastRating'),
  streak: sqliteInteger('streak').notNull().default(0),
});

export const sqliteQuizHidden = sqliteTable('quiz_hidden', {
  questionId: sqliteText('questionId').primaryKey(),
  userId: sqliteText('userId').notNull().default(''),
  createdAt: sqliteText('createdAt').notNull(),
});

// --- Quiz tables (PostgreSQL) ---

export const pgQuizCache = pgTable('quiz_cache', {
  userId: pgText('userId').notNull().default(''),
  noteId: pgText('noteId').notNull(),
  hash: pgText('hash').notNull(),
  questions: pgText('questions').notNull(),
  generatedAt: pgText('generatedAt').notNull(),
}, (t) => ({
  pk: pgPrimaryKey({ columns: [t.userId, t.noteId] }),
}));

export const pgQuizReviews = pgTable('quiz_reviews', {
  questionId: pgText('questionId').primaryKey(),
  userId: pgText('userId').notNull().default(''),
  noteId: pgText('noteId').notNull(),
  nextReviewAt: pgText('nextReviewAt'),
  lastReviewAt: pgText('lastReviewAt'),
  lastRating: pgText('lastRating'),
  streak: pgInteger('streak').notNull().default(0),
});

export const pgQuizHidden = pgTable('quiz_hidden', {
  questionId: pgText('questionId').primaryKey(),
  userId: pgText('userId').notNull().default(''),
  createdAt: pgText('createdAt').notNull(),
});

/** Per-user note read tracking (read count + timestamps). */
export const sqliteNoteReads = sqliteTable('note_reads', {
  userId: sqliteText('userId').notNull().default(''),
  noteId: sqliteText('noteId').notNull(),
  readCount: sqliteInteger('readCount').notNull().default(1),
  firstReadAt: sqliteText('firstReadAt').notNull(),
  lastReadAt: sqliteText('lastReadAt').notNull(),
}, (t) => ({
  pk: sqlitePrimaryKey({ columns: [t.userId, t.noteId] }),
}));

/** Per-user arbitrary settings stored as a JSON blob. */
export const sqliteUserSettings = sqliteTable('user_settings', {
  userId: sqliteText('userId').primaryKey(),
  settings: sqliteText('settings').notNull().default('{}'),
});

export const pgUserSettings = pgTable('user_settings', {
  userId: pgText('userId').primaryKey(),
  settings: pgText('settings').notNull().default('{}'),
});

/** Per-user learn progress: XP, streak, daily goal, and note mastery. */
export const sqliteLearnProgress = sqliteTable('learn_progress', {
  userId: sqliteText('userId').primaryKey(),
  xp: sqliteInteger('xp').notNull().default(0),
  todayXp: sqliteInteger('todayXp').notNull().default(0),
  dailyGoalXp: sqliteInteger('dailyGoalXp').notNull().default(100),
  streak: sqliteInteger('streak').notNull().default(0),
  lastActiveDate: sqliteText('lastActiveDate'),
  mastery: sqliteText('mastery').notNull().default('{}'),
});

export const pgLearnProgress = pgTable('learn_progress', {
  userId: pgText('userId').primaryKey(),
  xp: pgInteger('xp').notNull().default(0),
  todayXp: pgInteger('todayXp').notNull().default(0),
  dailyGoalXp: pgInteger('dailyGoalXp').notNull().default(100),
  streak: pgInteger('streak').notNull().default(0),
  lastActiveDate: pgText('lastActiveDate'),
  mastery: pgText('mastery').notNull().default('{}'),
});
