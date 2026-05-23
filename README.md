# Knowledge Loom

A local smart knowledge management app. When you capture something new, you choose whether to save a finished note as-is, ask Codex to polish a draft without adding facts, or ask Codex to research and write from a topic. Every path saves markdown, rebuilds category index files, and syncs searchable documents into Meilisearch.

## Stack

- Vite + React + TypeScript frontend, matching the lightweight organization of `interview_prep_react`.
- Express backend in `server/index.mjs`.
- Markdown source of truth under `knowledge/notes`.
- Category indexes under `knowledge/categories`.
- SQLite operational database at `knowledge/app.sqlite` for Codex jobs and AI flashcard cache.
- SQLite reminder database at `knowledge/reminders.sqlite`.
- Meilisearch index named `knowledge_notes` by default.

## Project Shape

```text
src/                 React UI, components, API client, view helpers
server/index.mjs     Express API routes
server/lib/          Services, repositories, Meilisearch sync, Codex runner
scripts/dev.mjs      Runs backend and Vite together
knowledge/           Notes, generated indexes, SQLite databases, search manifests
docker-compose.yml   Local Meilisearch service
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module ownership and data flow.
See [docs/AI_SPEC.md](docs/AI_SPEC.md) for the Codex prompt contracts and AI behavior rules.

## Run Locally

```bash
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

Open `http://localhost:5174`.

The backend listens on `http://localhost:8787`; Vite proxies `/api` to it.

## Creation

- `Write note`: writes a full draft directly to markdown. Enable `Allow AI polishing` to queue Codex with the user's draft as the factual source of truth. Codex may improve wording, structure, metadata, and supported links, but should not add new research.
- `Research & write`: queues Codex with a lightweight topic and optional context. Codex researches, categorizes, links, and writes the note.
- `Generate from link`: queues Codex with a URL. Codex retrieves the linked source, extracts the main content, and writes a note with the source URL preserved in the body.

## Codex Exec Flow

1. Submit a draft or topic in the Capture panel.
2. `POST /api/learn` either writes a direct note immediately or creates an async Codex job.
3. For AI modes, the backend runs `codex exec --skip-git-repo-check --output-last-message ...`.
4. The result is written to `knowledge/notes/YYYY-MM-DD-topic.md`.
5. The backend rebuilds the derived knowledge manifest.
6. Category markdown indexes are regenerated in `knowledge/categories`.
7. Meilisearch receives the updated note documents.

If `codex exec` fails, the job remains durable in SQLite and is retried. Interrupted `running` jobs are reset to `queued` when the backend restarts. Older `knowledge/jobs.json` files are imported into SQLite on first boot and then treated as legacy data.

## Editing Notes

The note editor supports normal manual edits plus an AI prompt panel. The AI panel rewrites the current unsaved draft in the form only; it does not save automatically. Review the proposed title, summary, tags, links, and markdown body, then use the normal Save button to persist the note.

## Reminders

Each article can have future review reminders. The backend stores reminders in a local SQLite database at `knowledge/reminders.sqlite`, while markdown remains the source of truth for note content. Active reminders appear on the desk, due reminders are highlighted, and completing or deleting a reminder updates SQLite immediately.

Deleting an article also deletes its reminders so the reminder database does not keep orphaned rows.

## Meilisearch

The app reads these environment variables:

```text
MEILI_HOST=http://localhost:7700
MEILI_MASTER_KEY=local_master_key
MEILI_INDEX=knowledge_notes
```

Every source rebuild incrementally syncs Meili documents so the search index mirrors the markdown source without deleting/re-adding unchanged notes. The UI search box uses `/api/search`; if Meilisearch is down, the backend returns local fallback results and labels the response as `fallback`.

`knowledge/index.json`, `knowledge/categories/*.md`, and `knowledge/meili-sync-*.json` are generated compatibility/projection artifacts. Durable app state should be stored in SQLite; search documents should be stored in Meilisearch.

## Tests

```bash
npm run test
npm run smoke:meili
npm run lint
npm run build
```

`npm run test` covers the SQLite repository layer. `npm run smoke:meili` runs a fake Meilisearch service and verifies incremental sync plus cleanup for deleted notes.

## Read-Only Mode

Set `KNOWLEDGE_READ_ONLY=1` or `READ_ONLY_MODE=1` to disable writes. The backend also treats Cloudflare-style env flags such as `CF_PAGES=1` or `WORKERS_CI=1` as read-only.

In read-only mode:

- capture/Codex job creation is rejected
- note update/delete routes return `403`
- category/search derived files are not written
- Meilisearch sync is skipped
- `/api/status` returns `{ "readOnly": true }`
