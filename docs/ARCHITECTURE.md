# Architecture

Knowledge Loom is intentionally local-first. Markdown files are the source of truth for note content. SQLite stores durable app state. Meilisearch stores the search projection. JSON manifests and category markdown are derived compatibility artifacts.

## Layers

The backend follows a three-layer shape:

```text
HTTP routes     server/index.mjs
Service layer   server/lib/notes.mjs, jobs.mjs, flashcards.mjs, codex.mjs
Data layer      server/lib/repositories/*.mjs, database.mjs, meili.mjs, markdown files
```

Routes validate HTTP input and return API responses. Services own workflows such as note creation, queue retries, index rebuilds, and flashcard generation. Repositories own durable state access and migrations. Meilisearch is intentionally isolated because it is not canonical storage; it is rebuilt from notes.

## Frontend

```text
src/App.tsx                    App shell, routing state, polling, top-level handlers
src/api.ts                     Typed HTTP client for the local backend
src/components/CaptureBox.tsx  Learning capture form
src/components/Home.tsx        Capture desk and in-flight jobs
src/components/NoteList.tsx    Shared note list rows
src/components/NoteDetail.tsx  Note reader/editor, tags, links, delete action
src/components/CategoryIndex.tsx
src/components/SearchOverlay.tsx
src/components/MiniGraph.tsx
src/lib/view.tsx               UI formatting, markdown block parsing, view types
src/types.ts                   API/domain types shared by components
```

`App.tsx` should stay thin. New UI behavior belongs in a component; shared formatting or note-view helpers belong in `src/lib/view.tsx`; backend calls belong in `src/api.ts`.

## Backend

```text
server/index.mjs        Express routes only
server/lib/config.mjs   Env loading, filesystem paths, runtime config
server/lib/database.mjs Shared SQLite connection for app operational state
server/lib/notes.mjs    Markdown parsing/writing, category indexes, note CRUD
server/lib/meili.mjs    Meilisearch settings, incremental sync, search
server/lib/codex.mjs    Codex exec prompt and note generation
server/lib/flashcards.mjs AI flashcard generation and cache workflow
server/lib/jobs.mjs     Durable queue service, retries, restart recovery
server/lib/repositories/jobs-repository.mjs SQLite queue persistence
server/lib/repositories/flashcard-repository.mjs SQLite AI flashcard cache persistence
server/lib/http.mjs     Request body and JSON response helpers
```

Mutating note routes must call `rebuildIndexes()`. That keeps category markdown, flashcard cache, JSON compatibility output, and Meilisearch synchronized with the markdown source files. In read-only mode, rebuilds return computed state without writing generated files or syncing Meilisearch.

## Job Lifecycle

`POST /api/learn` supports three creation modes:

- `write`: validates a complete title/body pair, writes markdown synchronously through `createKnowledgeNoteFromDraft()`, rebuilds indexes, and records a completed activity item in `knowledge/app.sqlite`.
- `polish`: queues a full draft for Codex. The polishing prompt treats the draft as the only factual source and asks Codex to improve clarity, structure, and metadata without adding new research.
- `research`: queues a lightweight topic/context request for Codex research and note generation.

For queued AI modes:

1. `POST /api/learn` writes a queued job to `knowledge/app.sqlite`.
2. `server/lib/jobs.mjs` processes one job at a time.
3. `server/lib/codex.mjs` runs `codex exec --skip-git-repo-check --output-last-message`.
4. A successful result becomes a markdown note under `knowledge/notes`.
5. `rebuildIndexes()` updates `knowledge/index.json`, category index markdown files, and Meilisearch.
6. Failed jobs retry up to `CODEX_JOB_MAX_ATTEMPTS`; interrupted `running` jobs are reset to `queued` on backend restart.

Older `knowledge/jobs.json` data is imported into SQLite when the jobs table is empty. New queue writes never depend on JSON.

## Source Of Truth

Do not hand-edit `knowledge/index.json`, `knowledge/categories/*.md`, `knowledge/flashcards.json`, or `knowledge/jobs.json`; they are generated or legacy artifacts. Edit markdown notes through the UI or by changing files under `knowledge/notes`, then trigger `GET /api/knowledge` or restart the backend to rebuild derived state.

Durable state ownership:

```text
knowledge/notes/**/*.md                 Canonical note content
knowledge/app.sqlite                    Codex jobs and AI flashcard cache
knowledge/reminders.sqlite              Reminder state
Meilisearch knowledge_notes             Search documents rebuilt from notes
knowledge/index.json                    Derived frontend compatibility manifest
knowledge/categories/*.md               Derived category index files
knowledge/meili-sync-*.json             Derived search sync manifest
```

## Edit Assistant

The note editor has two paths that intentionally stay separate:

- Manual edits call `PUT /api/notes/:id` and immediately rewrite the markdown source file.
- AI edit prompts call `POST /api/notes/:id/assist`, which runs Codex against the current unsaved draft and returns a structured proposal. The frontend applies that proposal to the edit form only; the user must still review and save through the normal update route.

This keeps Codex useful during editing without giving it a hidden write path.

## Meilisearch Sync

`server/lib/meili.mjs` uses `knowledge/meili-sync-<index>.json` as a local manifest of document hashes. A rebuild:

1. Builds Meili documents from note metadata plus markdown body.
2. Hashes each document.
3. Sends only changed documents with `PUT /documents`.
4. Deletes ids that existed in the previous manifest but no longer exist in markdown.
5. Saves the next manifest after a successful sync.

If the manifest does not exist yet, the sync reads remote document ids from Meilisearch so the first incremental pass can remove stale documents from older app versions.

## AI Flashcard Cache

`server/lib/flashcards.mjs` hashes note markdown plus filtering metadata. If the hash matches the SQLite cache row, the cards are reused. If the hash changes, Codex regenerates cards for that note only. Cache replacement deletes rows for removed notes so flashcard review cannot show cards from deleted articles.

Legacy `knowledge/flashcards.json` data is imported into SQLite when the cache table is empty. In read-only deployments, the backend may still read that JSON file as a static artifact.

## Tests And Gates

```text
npm run test         SQLite repository behavior
npm run smoke:meili  Meilisearch incremental sync and delete cleanup
npm run lint         TypeScript/React lint
npm run build        TypeScript and Vite production build
```

Passing these commands is not enough by itself for architecture changes. Check that new durable state goes through repositories, search-only data goes through Meilisearch, and derived files are rebuilt rather than edited by hand.

## Read-Only Mode

Read-only mode is enabled by `KNOWLEDGE_READ_ONLY=1`, `READ_ONLY_MODE=1`, `CF_PAGES=1`, or `WORKERS_CI=1`.

The frontend discovers this through `GET /api/status` and disables capture/edit/delete controls. The backend still enforces the mode: write routes return `403`, the Codex queue does not run, generated files are not written, and Meilisearch sync is skipped.
