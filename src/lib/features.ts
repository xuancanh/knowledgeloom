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

export function getFeatures(settings: Record<string, unknown> | null | undefined): FeatureToggles {
  const raw = ((settings as any)?.features ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_FEATURES };
  for (const key of Object.keys(DEFAULT_FEATURES) as (keyof FeatureToggles)[]) {
    if (raw[key] === false) out[key] = false;
  }
  return out;
}
