/**
 * Granular learning-feature toggles, stored under `features` in the per-user
 * settings blob. Everything defaults to ON; a user who only wants note
 * capture can switch the study machinery off — which also stops the AI
 * generation those features would otherwise trigger on every rebuild.
 *
 * Pure and decorator-free so both the server and tests can import it.
 * The frontend mirrors this shape in src/lib/features.ts.
 */

export interface FeatureToggles {
  /** AI flashcard generation + flashcard pages/queue. */
  flashcards: boolean;
  /** AI quiz generation + quiz pages/queue. */
  quiz: boolean;
  /** Learn sessions (slide decks, podcast, XP/streak). */
  learn: boolean;
  /** Today study queue, exam mode, retention stats. */
  today: boolean;
  /** Ask-AI chat and Socratic tutor. */
  chat: boolean;
  /** Marketplace browsing/publishing. */
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

/** Reads toggles out of a settings blob; unknown/missing values mean ON. */
export function getFeatureToggles(settings: Record<string, unknown> | null | undefined): FeatureToggles {
  const raw = (settings?.features ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_FEATURES };
  for (const key of Object.keys(DEFAULT_FEATURES) as (keyof FeatureToggles)[]) {
    if (raw[key] === false) out[key] = false;
  }
  return out;
}
