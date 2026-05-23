import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const tempDir = await mkdtemp(path.join(tmpdir(), 'knowledge-storage-'));
process.env.KNOWLEDGE_SKIP_DOTENV = '1';
process.env.APP_DB_PATH = path.join(tempDir, 'app.sqlite');

const { ensureApplicationDatabase } = await import('../server/lib/database.mjs');
const {
  listPersistedJobs,
  replacePersistedJobs,
  savePersistedJob,
} = await import('../server/lib/repositories/jobs-repository.mjs');
const {
  loadFlashcardCache,
  replaceFlashcardCache,
} = await import('../server/lib/repositories/flashcard-repository.mjs');

test.after(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

test('job repository persists and replaces queue snapshots', async () => {
  await ensureApplicationDatabase();
  const firstJob = {
    id: 'job-1',
    status: 'queued',
    mode: 'research',
    topic: 'Layered architecture',
    attempts: 0,
    maxAttempts: 3,
    createdAt: '2026-05-21T00:00:00.000Z',
    startedAt: null,
    finishedAt: null,
    nextRunAt: '2026-05-21T00:00:00.000Z',
    error: null,
  };

  replacePersistedJobs([firstJob]);
  assert.deepEqual(listPersistedJobs(), [firstJob]);

  savePersistedJob({ ...firstJob, status: 'running', attempts: 1, startedAt: '2026-05-21T00:01:00.000Z' });
  assert.equal(listPersistedJobs()[0].status, 'running');
  assert.equal(listPersistedJobs()[0].attempts, 1);

  replacePersistedJobs([]);
  assert.deepEqual(listPersistedJobs(), []);
});

test('flashcard repository replaces stale note cache rows', async () => {
  await ensureApplicationDatabase();
  replaceFlashcardCache({
    'note-a': {
      hash: 'hash-a',
      generatedAt: '2026-05-21T00:00:00.000Z',
      cards: [{ id: 'card-a', prompt: 'A prompt', lesson: 'A sufficiently detailed lesson.', kind: 'concept' }],
    },
    'note-b': {
      hash: 'hash-b',
      generatedAt: '2026-05-21T00:00:00.000Z',
      cards: [{ id: 'card-b', prompt: 'B prompt', lesson: 'Another sufficiently detailed lesson.', kind: 'pattern' }],
    },
  });

  assert.deepEqual(Object.keys(loadFlashcardCache()).sort(), ['note-a', 'note-b']);

  replaceFlashcardCache({
    'note-b': {
      hash: 'hash-b2',
      generatedAt: '2026-05-21T00:05:00.000Z',
      cards: [{ id: 'card-b2', prompt: 'Updated prompt', lesson: 'Updated lesson remains cached.', kind: 'lesson' }],
    },
  });

  const cache = loadFlashcardCache();
  assert.deepEqual(Object.keys(cache), ['note-b']);
  assert.equal(cache['note-b'].hash, 'hash-b2');
  assert.equal(cache['note-b'].cards[0].kind, 'lesson');
});
