import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { jobsPath, READ_ONLY_MODE } from '../config.mjs';
import { database } from '../database.mjs';

/**
 * Creates the durable job queue table.
 *
 * Frequently queried scheduler fields live in first-class columns. The complete
 * API job payload is also stored as JSON so adding note-generation metadata
 * does not require a migration for every small UI field.
 */
export function ensureJobRepository() {
  if (READ_ONLY_MODE) return;
  database().exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      topic TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      maxAttempts INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      startedAt TEXT,
      finishedAt TEXT,
      nextRunAt TEXT,
      error TEXT,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_status_next_run ON jobs(status, nextRunAt);
    CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(createdAt);
  `);
}

/**
 * Imports the old JSON queue once when a user upgrades from the file-backed
 * implementation. The source file is left untouched as a rollback/reference
 * artifact; all new writes go to SQLite.
 */
export async function importLegacyJobsIfEmpty() {
  if (READ_ONLY_MODE || !existsSync(jobsPath)) return;
  ensureJobRepository();
  const existing = database().prepare('SELECT COUNT(*) AS count FROM jobs').get();
  if (existing.count > 0) return;

  let raw;
  try {
    raw = JSON.parse(await readFile(jobsPath, 'utf8'));
  } catch {
    return;
  }

  const insert = database().prepare(`
    INSERT OR REPLACE INTO jobs
      (id, status, mode, topic, attempts, maxAttempts, createdAt, startedAt, finishedAt, nextRunAt, error, payload)
    VALUES
      ($id, $status, $mode, $topic, $attempts, $maxAttempts, $createdAt, $startedAt, $finishedAt, $nextRunAt, $error, $payload)
  `);
  database().exec('BEGIN');
  try {
    for (const job of raw.jobs || []) insert.run(bindJob(job));
    database().exec('COMMIT');
  } catch (error) {
    database().exec('ROLLBACK');
    throw error;
  }
}

/**
 * Returns all jobs in creation order for the in-memory queue and API activity
 * pages.
 */
export function listPersistedJobs() {
  if (READ_ONLY_MODE) return [];
  ensureJobRepository();
  return database()
    .prepare('SELECT payload FROM jobs ORDER BY createdAt ASC')
    .all()
    .map((row) => JSON.parse(row.payload));
}

/**
 * Upserts one job after every service-layer state transition.
 */
export function savePersistedJob(job) {
  if (READ_ONLY_MODE) return;
  ensureJobRepository();
  database().prepare(`
    INSERT INTO jobs
      (id, status, mode, topic, attempts, maxAttempts, createdAt, startedAt, finishedAt, nextRunAt, error, payload)
    VALUES
      ($id, $status, $mode, $topic, $attempts, $maxAttempts, $createdAt, $startedAt, $finishedAt, $nextRunAt, $error, $payload)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      mode = excluded.mode,
      topic = excluded.topic,
      attempts = excluded.attempts,
      maxAttempts = excluded.maxAttempts,
      createdAt = excluded.createdAt,
      startedAt = excluded.startedAt,
      finishedAt = excluded.finishedAt,
      nextRunAt = excluded.nextRunAt,
      error = excluded.error,
      payload = excluded.payload
  `).run(bindJob(job));
}

/**
 * Persists the whole in-memory queue after boot-time normalization.
 */
export function replacePersistedJobs(nextJobs) {
  if (READ_ONLY_MODE) return;
  ensureJobRepository();
  database().exec('BEGIN');
  try {
    database().prepare('DELETE FROM jobs').run();
    for (const job of nextJobs) savePersistedJob(job);
    database().exec('COMMIT');
  } catch (error) {
    database().exec('ROLLBACK');
    throw error;
  }
}

/**
 * Converts a job object into SQLite parameters, preserving full payload JSON.
 */
function bindJob(job) {
  return {
    $id: String(job.id),
    $status: String(job.status || 'queued'),
    $mode: String(job.mode || 'research'),
    $topic: String(job.topic || ''),
    $attempts: Number(job.attempts || 0),
    $maxAttempts: Number(job.maxAttempts || 0),
    $createdAt: String(job.createdAt || new Date().toISOString()),
    $startedAt: job.startedAt || null,
    $finishedAt: job.finishedAt || null,
    $nextRunAt: job.nextRunAt || null,
    $error: job.error || null,
    $payload: JSON.stringify(job),
  };
}
