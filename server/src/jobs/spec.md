# Jobs Module — Spec

**Location**: `server/src/jobs/`  
**NestJS module**: `JobsModule`

---

## Purpose

Durable AI job queue. Research, link, and polish requests from `POST /api/learn`
are serialised to SQLite so they survive server restarts. Only one job runs at a
time to avoid concurrent writes to markdown files and the search index.

---

## JobsService

Implements `OnModuleInit` and `OnModuleDestroy`.

### In-memory mirror

`readonly jobs = new Map<string, Job>()` mirrors the database for O(1) id
lookup by `JobsController`. All mutations go to both the map and SQLite.

### Boot sequence (`onModuleInit`)

1. Loads all persisted jobs from `JobRepository.listAll()`.
2. Jobs that were `running` at shutdown (server killed mid-job) are reset to
   `queued` so they retry.
3. Jobs with `status === 'error' && attempts < maxAttempts` are also re-queued.
4. Calls `saveAll()` to persist the normalised state.
5. Calls `scheduleQueue()` to start processing immediately.

### Job lifecycle

```
queued → running → done
                → error  (if attempts < maxAttempts → queued again after retryMs)
```

### `enqueue(payload): Promise<Job>`

Creates a new job with `status: 'queued'`, persists it, and schedules the queue.
The caller receives the job object and can expose the `id` to the client for polling.

### `recordCompleted(payload, result): Promise<Job>`

Records a `write`-mode note creation as a completed activity item. Direct writes
do not use Codex but appear in the activity rail alongside AI jobs.

### `scheduleQueue(delay = 0): void`

Schedules `processQueue()` via `setTimeout`. Clears any pending timer before
re-scheduling. Called after every enqueue and after every job completes.

### `processQueue()` (private)

Processes one queued job (the oldest one whose `nextRunAt ≤ now`).

On success: patches status to `done`, stores the result note reference.

On failure: increments `attempts`. If `attempts < maxAttempts`, re-queues with
`nextRunAt = now + retryMs`; otherwise sets `status: 'error'` (permanent).

After each job, calls `scheduleQueue()` to check for more work or the next
retry delay.

**Serial guarantee**: `activeJobId` prevents two jobs from running simultaneously.

### Configuration

| Config key | Env var | Default |
|-----------|---------|---------|
| `codexJobMaxAttempts` | `CODEX_JOB_MAX_ATTEMPTS` | `3` |
| `codexJobRetryMs` | `CODEX_JOB_RETRY_MS` | `60000` |

---

## JobRepository

Drizzle access layer for the `jobs` table.

**`listAll(): Job[]`** — selects all rows ordered by `createdAt asc`, parses the
`payload` JSON column. Returns `[]` in read-only mode.

**`save(job): void`** — upserts one job. Called after every state transition.
Uses `onConflictDoUpdate` so the same method handles both insert and update.

**`replaceAll(jobs): void`** — deletes all rows and re-inserts, wrapped in a
transaction. Used during boot-time normalisation.

---

## JobsController

Read-only HTTP surface:

| Route | Response |
|-------|----------|
| `GET /api/jobs` | `{ jobs: Job[] }` — all jobs from the in-memory map |
| `GET /api/jobs/:id` | Single job or 404 |

Mutations are handled by `LearnController` (enqueue) and `JobsService` (state
transitions). No write routes exist on `JobsController`.

---

## Module imports

`JobsModule` imports `CodexModule` (provides `CodexService`). `DatabaseModule`
is `@Global()` and does not need to be imported explicitly.
