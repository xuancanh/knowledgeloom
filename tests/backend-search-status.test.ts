import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { SearchStatusRepository } from '../server/src/search/search-status.repository';
import { degradedSearchStatus, healthySearchStatus } from '../server/src/search/search-status.util';

test('search status repository persists health per scope and engine', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kl-search-status-'));
  try {
    const repository = new SearchStatusRepository(new ConfigService({ usersDir: root }));
    const status = {
      engine: 'meilisearch',
      state: 'degraded' as const,
      lastAttemptAt: '2026-01-02T00:00:00.000Z',
      lastSuccessAt: '2026-01-01T00:00:00.000Z',
      error: 'connection refused',
    };
    await repository.save('user~space', status);
    assert.deepEqual(await repository.get('user~space', 'meilisearch'), status);
    assert.equal((await repository.get('user~space', 'inmemory')).state, 'unknown');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('search status transitions preserve the last successful sync', () => {
  const success = healthySearchStatus('meilisearch', '2026-01-01T00:00:00.000Z');
  const failure = degradedSearchStatus(
    'meilisearch',
    '2026-01-02T00:00:00.000Z',
    success.lastSuccessAt,
    new Error('search offline'),
  );
  assert.equal(success.state, 'healthy');
  assert.equal(failure.state, 'degraded');
  assert.equal(failure.lastSuccessAt, success.lastSuccessAt);
  assert.equal(failure.error, 'search offline');
});
