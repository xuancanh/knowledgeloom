# Architecture

Knowledge Loom is intentionally local-first. Markdown files are the source of truth for note content. SQLite stores durable app state. Meilisearch stores the search projection. JSON manifests and category markdown are derived compatibility artifacts.

## Layers

The backend follows a three-layer NestJS shape:

```text
HTTP Controllers   server/src/<module>/*.controller.ts
Service layer      server/src/<module>/*.service.ts
Data layer         server/src/<module>/*.repository.ts, database/, markdown files
```

Controllers validate HTTP input and return API responses. Services own workflows such as note creation, queue processing, index rebuilds, and flashcard generation. Repositories own durable state access. Meilisearch is intentionally isolated because it is not canonical storage; it is rebuilt from notes.

## Frontend

```text
src/api.ts                                 Typed HTTP client + RAG stream consumer
src/hooks/useRagChat.ts                    Chat state, streaming flag, abort controller
src/components/capture/CaptureBox.tsx      Learning capture form
src/components/chat/ChatPanel.tsx          Floating RAG chat panel (bottom-right)
src/components/notes/NoteDetail.tsx        Note reader/editor, tags, links, delete action
src/components/notes/NoteEditor.tsx        Edit form with AI assist panel
src/components/notes/AiAssistPanel.tsx     Inline AI edit proposal UI
src/components/routes/NoteRoute.tsx        Note detail route
src/components/routes/CategoryRoute.tsx    Category index route
src/components/routes/TagRoute.tsx         Tag index route
src/components/routes/FlashcardsRoute.tsx  Flashcard review route
src/components/Home.tsx                    Capture desk and in-flight jobs
src/components/SearchOverlay.tsx           Search overlay
src/components/MiniGraph.tsx               Graph view
src/types.ts                               API/domain types shared by components
```

`src/api.ts` should be the only file that makes HTTP calls to the backend. New UI behavior belongs in a component or hook; backend calls belong in `src/api.ts`. `streamRagAnswer(question, scope, history, signal)` in `src/api.ts` returns an `AsyncGenerator<string>` that consumes the chunked HTTP stream from `POST /api/rag/stream`.

## Backend

```text
server/src/ai/             Pluggable AI provider interface + CodexAiProvider + OpenRouterAiProvider
server/src/codex/          CodexService (prompt building), CodexRunnerService (CLI spawn)
server/src/common/         WritableGuard, note-parser.util.ts, shared types
server/src/config/         Typed env config (configuration.ts)
server/src/database/       Drizzle ORM + SQLite DDL + migrations
server/src/flashcards/     AI flashcard generation + SQLite cache keyed by note hash
server/src/images/         Image upload (POST /api/images), static file serving
server/src/jobs/           Durable Codex job queue (SQLite). One job at a time.
server/src/knowledge/      Index rebuild pipeline + GET /api/search + GET /api/knowledge
server/src/learn/          POST /api/learn entry point; routes by mode
server/src/notes/          Note CRUD, assist, assist-draft endpoints
server/src/rag/            RAG streaming endpoint (POST /api/rag/stream)
server/src/reminders/      Reminder CRUD
server/src/search/         MeilisearchProvider + InMemorySearchProvider
server/src/settings/       UserSettingsRepository + GET/PATCH /api/settings
server/src/status/         GET /api/status
server/src/storage/        Pluggable note storage: LocalNoteStorage or S3NoteStorage
```

All write routes are guarded by `WritableGuard` via `@UseGuards(WritableGuard)`. Mutating note routes must call `KnowledgeService.rebuildIndexes()`. That keeps category markdown, flashcard cache, JSON compatibility output, and Meilisearch synchronized with the markdown source files. In read-only mode, rebuilds return computed state without writing generated files or syncing Meilisearch.

Rebuilds list the complete note store so external additions, edits, moves, and
deletions remain authoritative. Storage-native fingerprints (filesystem
metadata or S3 ETags) let the note repository reuse parsed unchanged sources
from a bounded LRU cache; changed notes are read with capped concurrency. Tune
this with `NOTE_SOURCE_CACHE_MAX_MB` and `NOTE_READ_CONCURRENCY`.

`NotesModule` (service + controller) and `NotesFileModule` (repository only) are intentionally split to break a circular dependency with `KnowledgeModule`.

`GET /api/search` is declared in `KnowledgeModule` rather than `SearchModule` for the same reason.

## Composing the backend as a package

The server is also consumable as `@knowledge-loom/server` (built from
`server/`, barrel in `server/src/index.ts`). A private composing app mounts
extra modules and overrides the DI seams without file overlays:

```ts
AppModule.forRoot({
  extensions: [BillingModule, GroveModule],   // extra Nest modules
  authStrategy: SupabaseAuthStrategy,          // overrides AUTH_STRATEGY
  usageService: QuotaUsageService,             // overrides USAGE_SERVICE
})
```

`forRoot({})` builds the plain OSS app (this repo's `main.ts`). When no
explicit `extensions` are passed, the legacy `server/src/extensions/`
directory probe still runs for overlay builds. Only symbols exported from
`server/src/index.ts` are public API; everything else is internal.

## Job Lifecycle

`POST /api/learn` supports four creation modes:

- `write`: validates a complete title/body pair, writes markdown synchronously, rebuilds indexes, and records a completed activity item in `knowledge/app.sqlite`.
- `polish`: queues a full draft for Codex. The polishing prompt treats the draft as the only factual source.
- `research`: queues a lightweight topic/context request for Codex research and note generation.
- `link`: queues a URL for Codex to fetch, extract, and write as one note.

For queued AI modes:

1. `POST /api/learn` writes a `queued` job row to `knowledge/app.sqlite`.
2. The job runner in `jobs/` processes one job at a time (serial queue).
3. `CodexRunnerService` spawns `codex exec --skip-git-repo-check --output-last-message`.
4. A successful result is parsed and written as a markdown note under `knowledge/notes`.
5. `KnowledgeService.rebuildIndexes()` updates `knowledge/index.json`, category index markdown, and Meilisearch.
6. Failed jobs retry up to `CODEX_JOB_MAX_ATTEMPTS`; interrupted `running` jobs are reset to `queued` on backend restart.

Job state transitions: `queued` → `running` → `done` | `error`. Every transition is persisted to SQLite before the next step runs.

## RAG Pipeline

`POST /api/rag/stream` retrieves context from saved notes and streams AI-generated tokens back to the client over HTTP chunked transfer. It does not use WebSocket.

**Scope types:**

```text
{ type: 'all' }                           Semantic search across all notes
{ type: 'note';     id: string }          Full body of one note
{ type: 'category'; path: string }        All notes in a category, keyword-ranked
{ type: 'tag';      tag: string }         All notes with a tag, keyword-ranked
```

**Pipeline steps:**

1. Retrieve notes by scope: `note` → full markdown body; `category`/`tag` → filter all notes; `all` → semantic search via `SearchService` with keyword fallback.
2. Assemble context block: up to 12 notes, 16 000 chars total, truncated with `[…truncated]`.
3. Build a messages array: system prompt containing the context block, conversation history, then the user question.
4. Call `AiProvider.completeStream(messages)` → `AsyncGenerator<string>`.
5. Write each yielded token to the HTTP response via `res.write(token)`.

Transport is `text/plain` with `Transfer-Encoding: chunked`. The backend calls `res.flushHeaders()` immediately so the client starts reading before generation completes. The frontend reads via `ReadableStream` + `TextDecoder` inside `src/api.ts`.

## Source Of Truth

Do not hand-edit `knowledge/index.json`, `knowledge/categories/*.md`, or the search sync manifest; they are generated artifacts. Edit markdown notes through the UI or by changing files under `knowledge/notes`, then trigger `GET /api/knowledge` or restart the backend to rebuild derived state.

Durable state ownership:

```text
knowledge/notes/**/*.md          Canonical note content
knowledge/app.sqlite             Jobs, reminders, flashcard cache, note reads, user settings
Meilisearch knowledge_notes      Search documents rebuilt from notes
knowledge/index.json             Derived frontend compatibility manifest
knowledge/categories/*.md        Derived category index files
knowledge/meili-sync-*.json      Derived search sync manifest
```

Note: reminders are stored in `knowledge/app.sqlite`, not in a separate `knowledge/reminders.sqlite`. There is no `knowledge/reminders.sqlite`.

**User settings**: Per-user preferences are stored in the `user_settings` table (one row per user, `settings` column is a JSON blob). `GET /api/settings` reads the blob; `PATCH /api/settings` does a shallow merge. `KnowledgeService.getState()` always overlays fresh settings from the DB onto every `/api/knowledge` response — this bypasses the 30-second rebuild cooldown so settings changes are visible immediately without waiting for a full rebuild.

**Spaces (data scoping)**: every repository, file path, search index, and job
payload is keyed by one opaque scope string. The default space uses the bare
user id (pre-spaces data needs no migration); each additional space uses
`userId~spaceId` (`server/src/spaces/scope.util.ts`). `ApiAuthGuard` resolves
the `x-space-id` header into `request.scopeId` after verifying the space
belongs to the caller, and controllers pass it down via `@CurrentScope()`.
User-level concerns — settings, plan quotas, marketplace rating identity,
space management itself — stay on `@CurrentUser()` / `ownerOf(scope)`.
Deleting a space removes its files, per-scope DB rows, and search documents.
The space count is limited via the usage seam (`MAX_SPACES` env self-hosted;
subscription plan hosted).

**Note read tracking**: `note_reads` table records when each user opens each note. `POST /api/notes/:id/read` increments the read count; it is called silently by `NoteRoute` on every note open. `KnowledgeState` includes `readNoteIds` (array of note IDs the user has read) and `readCounts` (map of note ID → read count) so the frontend can filter and display read state without an extra request.

**Key invariants:**

1. Markdown is the source of truth. SQLite, `index.json`, `categories/`, and the search index are all derived. Every note mutation must call `KnowledgeService.rebuildIndexes()`.
2. Jobs are durable. Every state transition persists to SQLite before the next step runs.
3. Read-only mode. All write routes use `@UseGuards(WritableGuard)`.
4. One Codex job at a time (serial queue).
5. `NoteStorageProvider` contract: `listFiles()` returns paths relative to the notes root, sorted, ending in `.md`.

## Edit Assistant

The note editor has two paths that intentionally stay separate:

- Manual edits call `PUT /api/notes/:id` and immediately rewrite the markdown source file.
- AI edit proposals call `POST /api/notes/:id/assist`, which runs the AI provider against the current unsaved editor draft and returns a structured `{ update: NoteUpdate, codexStatus: string }` proposal. The frontend applies that proposal to the edit form only; the user must still review and save through the normal update route.

A third path handles unsaved captures:

- `POST /api/notes/assist-draft` operates on a draft that has not yet been saved as a note. No note ID is required. `CodexService.buildDraftAssistPrompt()` builds the prompt without a "current saved note" comparison. The frontend calls this from `CaptureBox` before the note is created. The user reviews the proposal in the capture form and saves normally.

This keeps the AI useful during both editing and capture without giving it a hidden write path.

## Meilisearch Sync

`SearchModule`'s `MeilisearchProvider` uses `knowledge/meili-sync-<index>.json` as a local manifest of document hashes. A rebuild:

1. Builds Meili documents from note metadata plus markdown body.
2. Hashes each document.
3. Sends only changed documents with `PUT /documents`.
4. Deletes ids that existed in the previous manifest but no longer exist in markdown.
5. Saves the next manifest after a successful sync.

If the manifest does not exist yet, the sync reads remote document ids from Meilisearch so the first incremental pass can remove stale documents from older app versions.

`InMemorySearchProvider` is the substring-match fallback used when Meilisearch is unavailable.

## AI Flashcard Cache

`FlashcardsModule` hashes note markdown plus filtering metadata. If the hash matches the SQLite cache row, the cards are reused. If the hash changes, the AI provider regenerates cards for that note only. Cache replacement deletes rows for removed notes so flashcard review cannot show cards from deleted notes.

## Tests And Gates

```text
npm run test         SQLite repository behavior
npm run smoke:meili  Meilisearch incremental sync and delete cleanup
npm run lint         TypeScript/React lint
npm run build        TypeScript and Vite production build
```

Passing these commands is not sufficient on its own for architecture changes. Check that new durable state goes through repositories, search-only data goes through Meilisearch, and derived files are rebuilt rather than edited by hand.

## Read-Only Mode

Read-only mode is enabled by `KNOWLEDGE_READ_ONLY=1`, `READ_ONLY_MODE=1`, `CF_PAGES=1`, or `WORKERS_CI=1`.

The frontend discovers this through `GET /api/status` (`{ readOnly: boolean }`) and disables capture/edit/delete controls. The backend enforces the mode independently: `WritableGuard` returns `403` on all write routes, the Codex queue does not run, generated files are not written, and Meilisearch sync is skipped.
