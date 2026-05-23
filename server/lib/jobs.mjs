import { CODEX_JOB_MAX_ATTEMPTS, CODEX_JOB_RETRY_MS, READ_ONLY_MODE } from './config.mjs';
import { createKnowledgeNote } from './codex.mjs';
import { ensureStore, slugify } from './notes.mjs';
import {
  importLegacyJobsIfEmpty,
  listPersistedJobs,
  replacePersistedJobs,
  savePersistedJob,
} from './repositories/jobs-repository.mjs';

export const jobs = new Map();
let activeJobId = null;
let queueTimer = null;

// Persisted jobs let the backend recover after restarts. A job that was
// running during shutdown is treated as queued and retried on boot.
/**
 * Loads durable job state from disk and converts interrupted/retryable work
 * back into queued work.
 */
export async function loadJobs() {
  if (READ_ONLY_MODE) return;
  await ensureStore();
  await importLegacyJobsIfEmpty();
  jobs.clear();
  for (const job of listPersistedJobs()) {
    const resumable = job.status === 'running' || (job.status === 'error' && job.attempts < job.maxAttempts);
    jobs.set(job.id, {
      ...job,
      status: resumable ? 'queued' : job.status,
      active: false,
      nextRunAt: resumable ? new Date().toISOString() : job.nextRunAt,
    });
  }
  await saveJobs();
}

/**
 * Persists the in-memory queue after every state transition.
 */
async function saveJobs() {
  if (READ_ONLY_MODE) return;
  replacePersistedJobs([...jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
}

/**
 * Schedules the queue processor. Delays are used for retry backoff.
 */
export function scheduleQueue(delay = 0) {
  if (READ_ONLY_MODE) return;
  if (queueTimer) clearTimeout(queueTimer);
  queueTimer = setTimeout(() => {
    queueTimer = null;
    processQueue().catch((error) => console.error(`Queue processor failed: ${error.message}`));
  }, delay);
}

/**
 * Adds a new learning item to the durable Codex queue.
 */
export async function enqueueLearning(payload) {
  if (READ_ONLY_MODE) {
    const error = new Error('service is running in read-only mode');
    error.status = 403;
    throw error;
  }
  const topic = String(payload.topic || payload.title || '').trim();
  const jobId = `${Date.now()}-${slugify(topic)}`;
  const now = new Date().toISOString();
  const job = {
    id: jobId,
    status: 'queued',
    mode: payload.mode || 'research',
    topic,
    context: payload.context || '',
    body: payload.body || '',
    url: payload.url || '',
    category: payload.category || '',
    summary: payload.summary || '',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    links: Array.isArray(payload.links) ? payload.links : [],
    attempts: 0,
    maxAttempts: CODEX_JOB_MAX_ATTEMPTS,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    nextRunAt: now,
    error: null,
  };
  jobs.set(jobId, job);
  savePersistedJob(job);
  scheduleQueue();
  return job;
}

/**
 * Records a synchronous note creation as a completed activity item.
 *
 * Direct writes do not need Codex, but keeping them in the same durable job log
 * makes the activity rail and restart behavior honest: every creation attempt
 * has a visible outcome even when no background worker was involved.
 */
export async function recordCompletedLearning(payload, result) {
  if (READ_ONLY_MODE) return null;
  const topic = String(payload.topic || payload.title || result.note?.title || '').trim();
  const now = new Date().toISOString();
  const job = {
    id: `${Date.now()}-${slugify(topic)}`,
    status: 'done',
    mode: payload.mode || 'write',
    topic,
    context: payload.context || '',
    url: payload.url || '',
    category: payload.category || '',
    summary: payload.summary || '',
    tags: Array.isArray(payload.tags) ? payload.tags : [],
    links: Array.isArray(payload.links) ? payload.links : [],
    attempts: 0,
    maxAttempts: 0,
    createdAt: now,
    startedAt: now,
    finishedAt: now,
    nextRunAt: null,
    error: null,
    ...result,
  };
  jobs.set(job.id, job);
  savePersistedJob(job);
  return job;
}

/**
 * Picks the oldest queued job whose retry delay has elapsed.
 */
function nextQueuedJob() {
  const now = Date.now();
  return [...jobs.values()]
    .filter((job) => job.status === 'queued' && Date.parse(job.nextRunAt || job.createdAt) <= now)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] || null;
}

/**
 * Calculates when the next queued job should be retried.
 */
function nextQueuedDelay() {
  const queued = [...jobs.values()].filter((job) => job.status === 'queued');
  if (!queued.length) return null;
  const next = Math.min(...queued.map((job) => Date.parse(job.nextRunAt || job.createdAt)));
  return Math.max(0, next - Date.now());
}

/**
 * Processes one job at a time.
 *
 * Keeping Codex executions serial avoids overlapping writes to markdown,
 * category indexes, and Meilisearch. Failures are retried until the configured
 * max attempts is reached; permanent failures remain visible in SQLite-backed
 * activity state.
 */
async function processQueue() {
  if (activeJobId) return;
  const job = nextQueuedJob();
  if (!job) {
    const delay = nextQueuedDelay();
    if (delay !== null) scheduleQueue(delay);
    return;
  }

  activeJobId = job.id;
  jobs.set(job.id, {
    ...job,
    status: 'running',
    attempts: job.attempts + 1,
    startedAt: new Date().toISOString(),
    error: null,
  });
  await saveJobs();

  try {
    const result = await createKnowledgeNote(job);
    jobs.set(job.id, {
      ...jobs.get(job.id),
      status: 'done',
      finishedAt: new Date().toISOString(),
      nextRunAt: null,
      ...result,
    });
  } catch (error) {
    const current = jobs.get(job.id);
    const canRetry = current.attempts < current.maxAttempts;
    jobs.set(job.id, {
      ...current,
      status: canRetry ? 'queued' : 'error',
      error: error.message,
      finishedAt: canRetry ? null : new Date().toISOString(),
      nextRunAt: canRetry ? new Date(Date.now() + CODEX_JOB_RETRY_MS).toISOString() : null,
    });
  } finally {
    activeJobId = null;
    await saveJobs();
    scheduleQueue();
  }
}
