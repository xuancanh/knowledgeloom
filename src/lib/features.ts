/**
 * Granular learning-feature toggles — frontend mirror of
 * server/src/settings/feature-toggles.ts. Stored under `features` in the
 * per-user settings blob; everything defaults to ON.
 */

export interface FeatureToggles {
  flashcards: boolean;
  quiz: boolean;
  learn: boolean;
  today: boolean;
  chat: boolean;
  marketplace: boolean;
}

export const DEFAULT_FEATURES: FeatureToggles = {
  flashcards: true,
  quiz: true,
  learn: true,
  today: true,
  chat: true,
  marketplace: true,
};

export const FEATURE_LABELS: Record<keyof FeatureToggles, { label: string; description: string }> = {
  flashcards: { label: 'Flashcards', description: 'AI-generated flashcards and spaced-repetition review. Disabling also stops flashcard generation for new notes.' },
  quiz: { label: 'Quizzes', description: 'AI-generated quiz questions and quiz review. Disabling also stops quiz generation for new notes.' },
  learn: { label: 'Learn sessions', description: 'Guided lessons, podcast mode, XP, streaks, and mastery.' },
  today: { label: 'Today queue', description: 'The unified study queue, exam mode, and retention stats.' },
  chat: { label: 'Ask AI & Tutor', description: 'The chat panel: questions over your notes and the Socratic tutor.' },
  marketplace: { label: 'Marketplace', description: 'Browsing, publishing, and importing community decks.' },
};

export function getFeatures(settings: Record<string, unknown> | null | undefined): FeatureToggles {
  const raw = ((settings as any)?.features ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_FEATURES };
  for (const key of Object.keys(DEFAULT_FEATURES) as (keyof FeatureToggles)[]) {
    if (raw[key] === false) out[key] = false;
  }
  return out;
}
