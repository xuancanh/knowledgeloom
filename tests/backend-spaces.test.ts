/**
 * Spaces unit tests — scope-key helpers (pure module —
 * server/src/spaces/scope.util.ts) and the self-hosted space limit.
 * Run: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeFor, ownerOf, spaceIdOf, DEFAULT_SPACE_ID, SPACE_ID_PATTERN } from '../server/src/spaces/scope.util';
import { NoopUsageService } from '../server/src/usage/usage.interface';

test('default space keeps the bare user id — pre-spaces data needs no migration', () => {
  assert.equal(scopeFor('local'), 'local');
  assert.equal(scopeFor('local', null), 'local');
  assert.equal(scopeFor('local', DEFAULT_SPACE_ID), 'local');
});

test('non-default spaces produce userId~spaceId scope keys', () => {
  assert.equal(scopeFor('local', 's1a2b3c4d5'), 'local~s1a2b3c4d5');
  assert.equal(scopeFor('9f8e7d6c-uuid', 'sabc'), '9f8e7d6c-uuid~sabc');
});

test('ownerOf and spaceIdOf round-trip both scope forms', () => {
  assert.equal(ownerOf('local'), 'local');
  assert.equal(spaceIdOf('local'), DEFAULT_SPACE_ID);
  assert.equal(ownerOf('local~sabc'), 'local');
  assert.equal(spaceIdOf('local~sabc'), 'sabc');
});

test('server-generated space ids match the guard pattern', () => {
  assert.ok(SPACE_ID_PATTERN.test('s1a2b3c4d5'));
  assert.ok(!SPACE_ID_PATTERN.test(''));
  assert.ok(!SPACE_ID_PATTERN.test('../escape'));
  assert.ok(!SPACE_ID_PATTERN.test('UPPER'));
  assert.ok(!SPACE_ID_PATTERN.test('has space'));
  assert.ok(!SPACE_ID_PATTERN.test('a'.repeat(41)));
});

test('NoopUsageService space limit: MAX_SPACES unset/0 = unlimited, otherwise the number', async () => {
  assert.equal(await new NoopUsageService().spaceLimit(), null);
  assert.equal(await new NoopUsageService(0).spaceLimit(), null);
  assert.equal(await new NoopUsageService(3).spaceLimit(), 3);
});
