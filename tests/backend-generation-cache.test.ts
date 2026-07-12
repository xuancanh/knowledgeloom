import test from 'node:test';
import assert from 'node:assert/strict';
import { failedGenerationTimestamp, shouldReuseGeneration } from '../server/src/common/generation-cache.util';

test('generation cache: successful entries remain reusable for the same content', () => {
  const entry = { hash: 'same', generatedAt: '2026-01-01T00:00:00.000Z' };
  assert.equal(shouldReuseGeneration(entry, 'same', 60_000, Date.now()), true);
  assert.equal(shouldReuseGeneration(entry, 'changed', 60_000, Date.now()), false);
});

test('generation cache: failures back off and retry after the configured window', () => {
  const failedAt = new Date('2026-01-01T00:00:00.000Z');
  const entry = { hash: 'same', generatedAt: failedGenerationTimestamp(failedAt) };
  assert.equal(shouldReuseGeneration(entry, 'same', 60_000, failedAt.getTime() + 59_999), true);
  assert.equal(shouldReuseGeneration(entry, 'same', 60_000, failedAt.getTime() + 60_000), false);
});

test('generation cache: malformed failure timestamps fail open for a retry', () => {
  assert.equal(shouldReuseGeneration({ hash: 'same', generatedAt: 'failed:invalid' }, 'same', 60_000), false);
});
