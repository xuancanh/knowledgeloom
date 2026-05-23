# Knowledge Loom — AI Agent Guide

This document describes the codebase for AI coding agents (Claude Code, Copilot,
Cursor, etc.). Read it before making changes so you understand the conventions,
the module boundaries, and where different concerns live.

---

## Repository layout

```
smart-knowledge-app/
├── src/                    # React frontend (Vite + TypeScript)
│   ├── components/         # UI components (NoteList, TagIndex, CategoryIndex, …)
│   ├── lib/                # Shared helpers (view.ts, api.ts)
│   └── types.ts            # Shared frontend types
├── server/
│   ├── src/                # NestJS backend (TypeScript) — the active server
│   │   ├── ai/             # Pluggable AI provider (Codex / OpenRouter)
│   │   ├── codex/          # AI note creation + edit assistant
│   │   ├── common/         # Guards, note-parser utility
│   │   ├── config/         # Typed configuration factory
│   │   ├── database/       # Drizzle ORM setup + DDL
│   │   ├── flashcards/     # AI flashcard generation + cache
│   │   ├── jobs/           # Durable Codex job queue
│   │   ├── knowledge/      # Index rebuild pipeline
│   │   ├── learn/          # Note capture endpoint
│   │   ├── notes/          # Note CRUD
│   │   ├── reminders/      # Note reminders
│   │   ├── search/         # Pluggable search (Meilisearch / in-memory)
│   │   ├── status/         # Health endpoint
│   │   ├── storage/        # Pluggable note storage (local / S3)
│   │   ├── app.module.ts   # Root NestJS module
│   │   └── main.ts         # Bootstrap
│   ├── index.mjs           # Legacy Express server (kept for reference, not used)
│   ├── lib/                # Legacy Express modules (kept for reference, not used)
│   ├── db/                 # Drizzle schema + init (ESM, used by legacy only)
│   ├── repositories/       # Drizzle repos (ESM, used by legacy only)
│   ├── package.json        # {"type":"commonjs"} — overrides root for NestJS output
│   └── tsconfig.json       # NestJS TypeScript config (CommonJS, emitDecoratorMetadata)
├── knowledge/              # Runtime data (NOT committed except schema)
│   ├── notes/              # Markdown source of truth (category sub-folders)
│   ├── categories/         # Generated category markdown files
│   ├── app.sqlite          # SQLite: jobs, reminders, flashcard_cache
│   └── index.json          # Generated knowledge index snapshot
├── scripts/
│   └── dev.mjs             # Starts ts-node NestJS + Vite in parallel
└── package.json            # Root: "type":"module" for Vite frontend
```

---

## Architecture: 3-layer NestJS backend

```
HTTP Controllers  →  Services  →  Repositories / Providers
```

### Layer rules
1. **Controllers** handle HTTP only: validate input, call one service method,
   return the result. No business logic.
2. **Services** own business logic. They may call multiple repositories and
   other services. They must not import Express types or reference HTTP.
3. **Repositories** own data access. They may only call one backend:
   a database, the filesystem, or an external HTTP API.

### Module boundary rules
- Each feature has its own `*.module.ts` that declares exactly the providers
  it owns and exports what other modules need.
- `@Global()` is used only for `DatabaseModule` and `ConfigModule` — they are
  infrastructure, not features.
- Injection tokens for non-class providers live in `*.constants.ts` files, not
  in module files. Use string constants, not `Symbol`.
- Never use `forwardRef()` — fix the circular dependency by splitting modules.

---

## Pluggable provider pattern

Three layers of the backend are abstract and swappable via env vars:

### AI provider (`server/src/ai/`)
| env | Provider | Description |
|-----|----------|-------------|
| `AI_PROVIDER=codex` | `CodexAiProvider` | Spawns `codex exec` CLI |
| `AI_PROVIDER=openrouter` | `OpenRouterAiProvider` | Any OpenAI-compatible HTTP API |

To add a new AI provider: implement `AiProvider`, register it in `AiModule`.

### Search provider (`server/src/search/`)
| env | Provider | Description |
|-----|----------|-------------|
| `SEARCH_PROVIDER=meilisearch` | `MeilisearchProvider` | Incremental Meilisearch sync |
| `SEARCH_PROVIDER=inmemory` | `InMemorySearchProvider` | In-process substring match |

To add a new search provider: implement `SearchProvider`, register it in `SearchModule`.

### Note storage provider (`server/src/storage/`)
| env | Provider | Description |
|-----|----------|-------------|
| `NOTE_STORAGE=local` | `LocalNoteStorage` | Local filesystem |
| `NOTE_STORAGE=s3` | `S3NoteStorage` | Any S3-compatible store (R2, AWS, MinIO) |

To add a new storage provider: implement `NoteStorageProvider`, register it in `StorageModule`.

---

## Key invariants — do not break these

1. **Markdown is the source of truth.** The database (SQLite), `index.json`,
   `categories/`, and the search index are all derived artifacts. Mutating note
   routes must call `KnowledgeService.rebuildIndexes()` at the end.

2. **Jobs are durable.** `JobsService` persists every state transition to SQLite
   so the queue survives server restarts. Do not skip `JobRepository.save()`.

3. **Read-only mode.** All write paths check `config.get('readOnly')` or use
   `WritableGuard`. Adding a new write endpoint requires `@UseGuards(WritableGuard)`.

4. **One job at a time.** `JobsService` processes one AI job serially to avoid
   concurrent writes to markdown files and the search index. Do not parallelise.

5. **NoteStorageProvider contract.** `listFiles()` must return paths relative to
   the notes root, sorted alphabetically, ending in `.md`. `parseNote(file, markdown)`
   uses the relative path to build the note id and the `path` field.

---

## Configuration reference

All config is loaded in `server/src/config/configuration.ts` from environment
variables (and `.env` at the project root). Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8787` | Backend listen port |
| `NOTE_STORAGE` | `local` | `local` or `s3` |
| `SEARCH_PROVIDER` | `meilisearch` | `meilisearch` or `inmemory` |
| `AI_PROVIDER` | `codex` | `codex` or `openrouter` |
| `AI_API_KEY` | — | API key for OpenRouter / DeepSeek / etc. |
| `AI_API_BASE_URL` | `https://openrouter.ai/api/v1` | OpenAI-compatible base URL |
| `AI_MODEL` | `anthropic/claude-3-5-sonnet` | Model name |
| `MEILI_HOST` | `http://localhost:7700` | Meilisearch host |
| `MEILI_MASTER_KEY` | — | Meilisearch master key |
| `S3_ENDPOINT` | — | S3-compatible endpoint (required for `NOTE_STORAGE=s3`) |
| `S3_BUCKET` | — | Bucket name |
| `S3_ACCESS_KEY_ID` | — | Access key ID |
| `S3_SECRET_ACCESS_KEY` | — | Secret access key |
| `KNOWLEDGE_READ_ONLY` | `0` | Set to `1` for read-only deployments |
| `AI_FLASHCARDS_DISABLED` | `0` | Set to `1` to skip AI flashcard generation |

---

## Development workflow

```bash
# Install deps
npm install

# Start full stack (ts-node NestJS + Vite)
npm run dev

# Type-check backend only
npx tsc -p server/tsconfig.json --noEmit

# Type-check frontend only
npx tsc -b --noEmit

# Build everything (NestJS + Vite)
npm run build

# Run production server (after build)
npm run server
```

---

## Adding a feature — checklist

- [ ] Create or update the entity/schema in `server/src/database/schema.ts`
- [ ] Write a repository class in the feature folder (inject `DRIZZLE_DB`)
- [ ] Write a service with business logic (no HTTP types)
- [ ] Write a controller with route handlers (no business logic)
- [ ] Create or update `*.module.ts` to wire providers, declare controllers
- [ ] Import the module in `app.module.ts` if it is a new top-level feature
- [ ] Add `@UseGuards(WritableGuard)` to any write endpoints
- [ ] Call `KnowledgeService.rebuildIndexes()` after any note mutation
- [ ] Add the config key to `configuration.ts` if a new env variable is needed
- [ ] Run `npx tsc -p server/tsconfig.json --noEmit` — must pass with 0 errors

---

## Frontend conventions

- `src/api.ts` — all fetch calls to `/api/*`; add new API calls here
- `src/types.ts` — frontend types (subset of backend types)
- `src/components/` — one file per page/feature component
- `src/index.css` — all styles; no CSS modules or Tailwind
- CSS naming: `ci-*` for CategoryIndex, `ti-*` for TagIndex, `ni-*` for NoteIndex
- The rail (sidebar) uses `railOpen` state in `App.tsx`; mobile is a fixed overlay
