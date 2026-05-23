import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { eq, asc } from 'drizzle-orm';
import { getDb } from '../db/index.mjs';
import { jobs as jobsTable } from '../db/schema.mjs';
import { jobsPath, READ_ONLY_MODE } from '../lib/config.mjs';

/**
 * Returns all jobs in creation order.
 */
export function listAll() {
  if (READ_ONLY_MODE) return [];
  return getDb()
    .select()
    .from(jobsTable)
    .orderBy(asc(jobsTable.createdAt))
    .all()
    .map((row) => JSON.parse(row.payload));
}

/**
 * Upserts one job record. The full job object is JSON-serialised into `payload`
 * so new UI fields do not require schema migrations.
 */
export function save(job) {
  if (READ_ONLY_MODE) return;
  const row = _bind(job);
  getDb()
    .insert(jobsTable)
    .values(row)
    .onConflictDoUpdate({
      target: jobsTable.id,
      set: {
        status: row.status,
        mode: row.mode,
        topic: row.topic,
        attempts: row.attempts,
        maxAttempts: row.maxAttempts,
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        nextRunAt: row.nextRunAt,
        error: row.error,
        payload: row.payload,
      },
    })
    .run();
}

/**
 * Replaces all persisted jobs atomically. Used after boot-time normalisation.
 */
export function replaceAll(nextJobs) {
  if (READ_ONLY_MODE) return;
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(jobsTable).run();
    for (const job of nextJobs) {
      const row = _bind(job);
      tx.insert(jobsTable).values(row).run();
    }
  });
}

/**
 * Imports the old jobs.json once when a user upgrades from the file-backed
 * implementation. The source file is left untouched as a rollback artifact.
 */
export async function importLegacyIfEmpty() {
  if (READ_ONLY_MODE || !existsSync(jobsPath)) return;

  const db = getDb();
  const { n } = db.select({ n: jobsTable.id }).from(jobsTable).all().length !== undefined
    ? { n: db.select().from(jobsTable).all().length }
    : { n: 0 };
  if (n > 0) return;

  // Re-read row count via a simpler approach
  const rows = db.select().from(jobsTable).all();
  if (rows.length > 0) return;

  let raw;
  try {
    raw = JSON.parse(await readFile(jobsPath, 'utf8'));
  } catch {
    return;
  }

  db.transaction((tx) => {
    for (const job of raw.jobs || []) {
      const row = _bind(job);
      tx.insert(jobsTable).values(row).onConflictDoUpdate({
        target: jobsTable.id,
        set: { payload: row.payload },
      }).run();
    }
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _bind(job) {
  return {
    id: String(job.id),
    status: String(job.status || 'queued'),
    mode: String(job.mode || 'research'),
    topic: String(job.topic || ''),
    attempts: Number(job.attempts || 0),
    maxAttempts: Number(job.maxAttempts || 0),
    createdAt: String(job.createdAt || new Date().toISOString()),
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    nextRunAt: job.nextRunAt || null,
    error: job.error || null,
    payload: JSON.stringify(job),
  };
}
