/** Flashcard rating levels for the study session and spaced repetition. */
export type Rating = 'again' | 'hard' | 'good';

/** Outcome of a spaced repetition review computation. */
export type ReviewOutcome = {
  easeFactor: string;
  interval: number;
  repetitions: number;
  nextReviewAt: string;
};
