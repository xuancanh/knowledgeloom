/** CSS variable color mapping for each flashcard kind. */
export const KIND_COLOR: Record<string, string> = {
  concept: 'var(--indigo)',
  question: 'var(--teal)',
  lesson: 'var(--moss)',
  tradeoff: 'var(--ochre)',
  pattern: 'var(--rust)',
};

/** Human-readable label for each flashcard kind. */
export const KIND_LABEL: Record<string, string> = {
  concept: 'Concept',
  question: 'Question',
  lesson: 'Lesson',
  tradeoff: 'Tradeoff',
  pattern: 'Pattern',
};

/** Human-readable label for each rating level. */
export const RATING_LABEL: Record<string, string> = {
  again: 'Forgot',
  hard: 'Tricky',
  good: 'Easy',
};

/** CSS variable color mapping for each rating level. */
export const RATING_COLOR: Record<string, string> = {
  again: 'var(--rust)',
  hard: 'var(--ochre)',
  good: 'var(--moss)',
};
