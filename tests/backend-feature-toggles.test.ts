/**
 * Feature-toggle helper unit tests (pure module —
 * server/src/settings/feature-toggles.ts). Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getFeatureToggles, DEFAULT_FEATURES } from '../server/src/settings/feature-toggles';

test('everything defaults to ON for missing/empty/null settings', () => {
  assert.deepEqual(getFeatureToggles(undefined), DEFAULT_FEATURES);
  assert.deepEqual(getFeatureToggles(null), DEFAULT_FEATURES);
  assert.deepEqual(getFeatureToggles({}), DEFAULT_FEATURES);
  assert.deepEqual(getFeatureToggles({ features: {} }), DEFAULT_FEATURES);
});

test('only an explicit false disables a feature', () => {
  const t = getFeatureToggles({ features: { quiz: false, flashcards: true } });
  assert.equal(t.quiz, false);
  assert.equal(t.flashcards, true);
  assert.equal(t.learn, true);
});

test('junk values are ignored — never accidentally disabled', () => {
  const t = getFeatureToggles({ features: { flashcards: 0, quiz: 'false', learn: null, today: undefined } } as any);
  assert.deepEqual(t, DEFAULT_FEATURES);
});

test('unknown keys in the blob do not leak into the toggles', () => {
  const t = getFeatureToggles({ features: { quiz: false, evilExtra: false } } as any);
  assert.equal((t as any).evilExtra, undefined);
  assert.equal(t.quiz, false);
});
