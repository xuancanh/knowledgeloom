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
  stability: sqliteText('stability'),
  difficulty: sqliteText('difficulty'),
  lapses: sqliteInteger('lapses').notNull().default(0),
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
  stability: pgText('stability'),
  difficulty: pgText('difficulty'),
  lapses: pgInteger('lapses').notNull().default(0),
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
  stability: sqliteText('stability'),
  difficulty: sqliteText('difficulty'),
  lapses: sqliteInteger('lapses').notNull().default(0),
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
  stability: pgText('stability'),
  difficulty: pgText('difficulty'),
  lapses: pgInteger('lapses').notNull().default(0),
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

export const pgNoteReads = pgTable('note_reads', {
  userId: pgText('userId').notNull().default(''),
  noteId: pgText('noteId').notNull(),
  readCount: pgInteger('readCount').notNull().default(1),
  firstReadAt: pgText('firstReadAt').notNull(),
  lastReadAt: pgText('lastReadAt').notNull(),
}, (t) => ({
  pk: pgPrimaryKey({ columns: [t.userId, t.noteId] }),
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

/**
 * Append-only review log — one row per flashcard/quiz rating. This is what
 * retention analytics are computed from (current-state tables can't answer
 * "how often do I remember after N days").
 */
export const sqliteReviewEvents = sqliteTable('review_events', {
  id: sqliteInteger('id').primaryKey({ autoIncrement: true }),
  userId: sqliteText('userId').notNull().default(''),
  itemId: sqliteText('itemId').notNull(),
  itemType: sqliteText('itemType').notNull(), // 'flashcard' | 'quiz'
  noteId: sqliteText('noteId').notNull().default(''),
  rating: sqliteText('rating').notNull(),     // again/hard/good | correct/wrong
  grade: sqliteInteger('grade').notNull(),    // FSRS grade 1..4
  elapsedDays: sqliteText('elapsedDays').notNull().default('0'),
  stability: sqliteText('stability'),
  reviewedAt: sqliteText('reviewedAt').notNull(),
});

export const pgReviewEvents = pgTable('review_events', {
  id: pgInteger('id').primaryKey().generatedAlwaysAsIdentity(),
  userId: pgText('userId').notNull().default(''),
  itemId: pgText('itemId').notNull(),
  itemType: pgText('itemType').notNull(),
  noteId: pgText('noteId').notNull().default(''),
  rating: pgText('rating').notNull(),
  grade: pgInteger('grade').notNull(),
  elapsedDays: pgText('elapsedDays').notNull().default('0'),
  stability: pgText('stability'),
  reviewedAt: pgText('reviewedAt').notNull(),
});

/** Public share links: an unguessable id maps to one note + its study deck. */
export const sqliteShares = sqliteTable('shares', {
  id: sqliteText('id').primaryKey(),
  userId: sqliteText('userId').notNull().default(''),
  // Target: a note id (kind='note') or a category path (kind='category').
  noteId: sqliteText('noteId').notNull(),
  kind: sqliteText('kind').notNull().default('note'),
  createdAt: sqliteText('createdAt').notNull(),
  revokedAt: sqliteText('revokedAt'),
  // Optional ISO expiry; null = never expires. Enforced at lookup time.
  expiresAt: sqliteText('expiresAt'),
});

export const pgShares = pgTable('shares', {
  id: pgText('id').primaryKey(),
  userId: pgText('userId').notNull().default(''),
  noteId: pgText('noteId').notNull(),
  kind: pgText('kind').notNull().default('note'),
  createdAt: pgText('createdAt').notNull(),
  revokedAt: pgText('revokedAt'),
  expiresAt: pgText('expiresAt'),
});

/** Marketplace: published shares browseable and importable by anyone. */
export const sqliteMarketplaceListings = sqliteTable('marketplace_listings', {
  id: sqliteText('id').primaryKey(),
  shareId: sqliteText('shareId').notNull(),
  userId: sqliteText('userId').notNull().default(''),
  title: sqliteText('title').notNull(),
  description: sqliteText('description').notNull().default(''),
  kind: sqliteText('kind').notNull().default('note'),
  tags: sqliteText('tags').notNull().default('[]'),
  author: sqliteText('author').notNull().default(''),
  imports: sqliteInteger('imports').notNull().default(0),
  publishedAt: sqliteText('publishedAt').notNull(),
  unpublishedAt: sqliteText('unpublishedAt'),
});

export const pgMarketplaceListings = pgTable('marketplace_listings', {
  id: pgText('id').primaryKey(),
  shareId: pgText('shareId').notNull(),
  userId: pgText('userId').notNull().default(''),
  title: pgText('title').notNull(),
  description: pgText('description').notNull().default(''),
  kind: pgText('kind').notNull().default('note'),
  tags: pgText('tags').notNull().default('[]'),
  author: pgText('author').notNull().default(''),
  imports: pgInteger('imports').notNull().default(0),
  publishedAt: pgText('publishedAt').notNull(),
  unpublishedAt: pgText('unpublishedAt'),
});

/** One star rating per user per marketplace listing. */
export const sqliteMarketplaceRatings = sqliteTable('marketplace_ratings', {
  listingId: sqliteText('listingId').notNull(),
  userId: sqliteText('userId').notNull(),
  stars: sqliteInteger('stars').notNull(),
  comment: sqliteText('comment').notNull().default(''),
  createdAt: sqliteText('createdAt').notNull(),
}, (t) => ({
  pk: sqlitePrimaryKey({ columns: [t.listingId, t.userId] }),
}));

export const pgMarketplaceRatings = pgTable('marketplace_ratings', {
  listingId: pgText('listingId').notNull(),
  userId: pgText('userId').notNull(),
  stars: pgInteger('stars').notNull(),
  comment: pgText('comment').notNull().default(''),
  createdAt: pgText('createdAt').notNull(),
}, (t) => ({
  pk: pgPrimaryKey({ columns: [t.listingId, t.userId] }),
}));

/** One report per user per listing (dedup); enough reports auto-unpublish it. */
export const sqliteMarketplaceReports = sqliteTable('marketplace_reports', {
  listingId: sqliteText('listingId').notNull(),
  userId: sqliteText('userId').notNull(),
  reason: sqliteText('reason').notNull().default(''),
  createdAt: sqliteText('createdAt').notNull(),
}, (t) => ({
  pk: sqlitePrimaryKey({ columns: [t.listingId, t.userId] }),
}));

export const pgMarketplaceReports = pgTable('marketplace_reports', {
  listingId: pgText('listingId').notNull(),
  userId: pgText('userId').notNull(),
  reason: pgText('reason').notNull().default(''),
  createdAt: pgText('createdAt').notNull(),
}, (t) => ({
  pk: pgPrimaryKey({ columns: [t.listingId, t.userId] }),
}));

/**
 * User-created spaces (isolated sub-workspaces). The default space is
 * implicit — it has no row here (see spaces/scope.util.ts).
 */
export const sqliteSpaces = sqliteTable('spaces', {
  id: sqliteText('id').primaryKey(),
  userId: sqliteText('userId').notNull(),
  name: sqliteText('name').notNull(),
  createdAt: sqliteText('createdAt').notNull(),
});

export const pgSpaces = pgTable('spaces', {
  id: pgText('id').primaryKey(),
  userId: pgText('userId').notNull(),
  name: pgText('name').notNull(),
  createdAt: pgText('createdAt').notNull(),
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
