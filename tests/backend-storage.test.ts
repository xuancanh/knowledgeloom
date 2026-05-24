/**
 * Backend storage integration test — verifies the SQLite schema and Drizzle
 * query layer work correctly for jobs and flashcard cache tables.
 *
 * Uses Drizzle directly to avoid depending on NestJS DI decorator compilation.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { sqliteJobs, sqliteFlashcardCache } from '../server/src/database/schema.js';

const DDL = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, status TEXT NOT NULL, mode TEXT NOT NULL,
    topic TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    maxAttempts INTEGER NOT NULL DEFAULT 0, createdAt TEXT NOT NULL,
    startedAt TEXT, finishedAt TEXT, nextRunAt TEXT, error TEXT,
    payload TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS flashcard_cache (
    noteId TEXT PRIMARY KEY, hash TEXT NOT NULL,
    cards TEXT NOT NULL, generatedAt TEXT NOT NULL
  );
`;

const tempDir = mkdtempSync(path.join(tmpdir(), 'knowledge-storage-'));
const dbPath = path.join(tempDir, 'app.sqlite');
const sqlite = new Database(dbPath);
sqlite.exec(DDL);
const db = drizzle(sqlite, { schema: { sqliteJobs, sqliteFlashcardCache } });

test.after(() => {
  sqlite.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test('job table persists and updates queue snapshots', async () => {
  const job = {
    id: 'job-1',
    status: 'queued',
    mode: 'research',
    topic: 'Layered architecture',
    attempts: 0,
    maxAttempts: 3,
    createdAt: '2026-05-21T00:00:00.000Z',
    startedAt: null as string | null,
    finishedAt: null as string | null,
    nextRunAt: '2026-05-21T00:00:00.000Z',
    error: null as string | null,
    payload: '{}',
  };

  await db.insert(sqliteJobs).values(job);
  const rows = await db.select().from(sqliteJobs);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'job-1');
  assert.equal(rows[0].status, 'queued');

  await db.update(sqliteJobs)
    .set({ status: 'running', attempts: 1, startedAt: '2026-05-21T00:01:00.000Z' })
    .where(eq(sqliteJobs.id, 'job-1'));

  const updated = await db.select().from(sqliteJobs);
  assert.equal(updated[0].status, 'running');
  assert.equal(updated[0].attempts, 1);

  await db.delete(sqliteJobs);
  assert.deepEqual(await db.select().from(sqliteJobs), []);
});

test('flashcard cache table replaces stale note rows', async () => {
  const rows = [
    { noteId: 'note-a', hash: 'hash-a', cards: JSON.stringify([{ id: 'card-a', kind: 'concept' }]), generatedAt: '2026-05-21T00:00:00.000Z' },
    { noteId: 'note-b', hash: 'hash-b', cards: JSON.stringify([{ id: 'card-b', kind: 'pattern' }]), generatedAt: '2026-05-21T00:00:00.000Z' },
  ];
  await db.insert(sqliteFlashcardCache).values(rows);

  const first = await db.select().from(sqliteFlashcardCache);
  assert.deepEqual(first.map(r => r.noteId).sort(), ['note-a', 'note-b']);

  // Replace: delete all, insert only note-b with new hash
  await db.delete(sqliteFlashcardCache);
  await db.insert(sqliteFlashcardCache).values([
    { noteId: 'note-b', hash: 'hash-b2', cards: JSON.stringify([{ id: 'card-b2', kind: 'lesson' }]), generatedAt: '2026-05-21T00:05:00.000Z' },
  ]);

  const second = await db.select().from(sqliteFlashcardCache);
  assert.equal(second.length, 1);
  assert.equal(second[0].noteId, 'note-b');
  assert.equal(second[0].hash, 'hash-b2');
  assert.equal(JSON.parse(second[0].cards)[0].kind, 'lesson');
});
