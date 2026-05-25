import type { QuizQuestionType } from '../../types';

export const QUIZ_TYPE_LABELS: Record<QuizQuestionType, string> = {
  'fill-blank': 'Fill in the blank',
  'multiple-choice': 'Multiple choice',
  'short-answer': 'Short answer',
};

export const QUIZ_TYPE_COLORS: Record<QuizQuestionType, string> = {
  'fill-blank': 'var(--accent)',
  'multiple-choice': 'var(--moss)',
  'short-answer': 'var(--rust)',
};
