/**
 * Injection tokens for the Drizzle database provider.
 *
 * NestJS convention: injection tokens for non-class providers (factories,
 * values) are defined in a dedicated constants file so they can be imported by
 * repositories without creating circular dependencies with the module file.
 *
 * We use a string token rather than a Symbol because string tokens are
 * serialisable, work reliably across module boundaries in Node.js, and are
 * easier to inspect in debug output.
 */
export const DRIZZLE_DB = 'DRIZZLE_DB';
export const JOBS_TABLE = 'JOBS_TABLE';
export const REMINDERS_TABLE = 'REMINDERS_TABLE';
export const FLASHCARD_CACHE_TABLE = 'FLASHCARD_CACHE_TABLE';
export const FLASHCARD_REVIEWS_TABLE = 'FLASHCARD_REVIEWS_TABLE';
export const USER_FLASHCARDS_TABLE = 'USER_FLASHCARDS_TABLE';
export const HIDDEN_FLASHCARDS_TABLE = 'HIDDEN_FLASHCARDS_TABLE';
export const QUIZ_CACHE_TABLE = 'QUIZ_CACHE_TABLE';
export const QUIZ_REVIEWS_TABLE = 'QUIZ_REVIEWS_TABLE';
export const QUIZ_HIDDEN_TABLE = 'QUIZ_HIDDEN_TABLE';
export const NOTE_READS_TABLE = 'NOTE_READS_TABLE';
export const USER_SETTINGS_TABLE = 'USER_SETTINGS_TABLE';
export const LEARN_PROGRESS_TABLE = 'LEARN_PROGRESS_TABLE';
export const REVIEW_EVENTS_TABLE = 'REVIEW_EVENTS_TABLE';
export const SHARES_TABLE = 'SHARES_TABLE';
export const MARKETPLACE_LISTINGS_TABLE = 'MARKETPLACE_LISTINGS_TABLE';
export const MARKETPLACE_RATINGS_TABLE = 'MARKETPLACE_RATINGS_TABLE';
