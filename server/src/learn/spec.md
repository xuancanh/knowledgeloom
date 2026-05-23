# Learn Module — Spec

**Location**: `server/src/learn/`  
**NestJS module**: `LearnModule`

---

## Purpose

Single entry point for all note capture. Receives the `POST /api/learn` request
from `CaptureBox`, branches by mode, and either creates a note synchronously or
enqueues a durable Codex job.

---

## LearnController

```
POST /api/learn  @UseGuards(WritableGuard)
```

### Request body

| Field | Required | Description |
|-------|----------|-------------|
| `mode` | no (default `research`) | `write \| polish \| research \| link` |
| `title` | yes (except `link`) | Topic or note title |
| `body` | yes for `write`/`polish` | Draft markdown body |
| `url` | yes for `link` | Must be a valid `http(s)` URL |
| `context` | no | Extra guidance for Codex |
| `category` | no | Suggested category |
| `summary` | no | One-line summary |
| `tags` | no | Array of strings |
| `links` | no | Array of note ids |

### Mode routing

**`write`** — Synchronous. Calls `NotesService.createFromDraft()` directly.
Does not invoke Codex. Records a completed activity item via
`JobsService.recordCompleted()`. Returns the note, state, and markdown immediately.

**`polish`** — Asynchronous. Requires `body`. Enqueues a Codex job via
`JobsService.enqueue()`. Returns `{ jobId, job }` (HTTP 202 implied by the
`job.status === 'queued'` shape).

**`research`** — Asynchronous. Requires `title`. Enqueues a Codex job.

**`link`** — Asynchronous. Requires a valid `http(s)` URL. Enqueues a Codex job.

### Response

Write mode returns:
```json
{ "jobId": "...", "job": {...}, "note": {...}, "state": {...}, "markdown": "..." }
```

All other modes return:
```json
{ "jobId": "...", "job": { "status": "queued", ... } }
```

The frontend uses `jobId` to poll `GET /api/jobs/:id` until `status === 'done'`.

---

## Module imports

`LearnModule` imports `NotesModule` and `JobsModule`.
