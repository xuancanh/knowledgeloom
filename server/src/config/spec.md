# Config Module — Spec

**Location**: `server/src/config/`  
**NestJS module**: built-in `ConfigModule` (registered `@Global()` in `AppModule`)  
**Factory**: `configuration.ts`

---

## Purpose

Loads all environment variables once at startup, normalises them into typed
config keys, and makes them available everywhere via `ConfigService.get<T>(key)`.
No module needs to read `process.env` directly.

---

## Path resolution

`__dirname` in the factory is `server/dist/config` (compiled) or
`server/src/config` (ts-node). Both require `resolve(__dirname, '../../..')` to
reach the project root — one level up per `dist|src`, `config`, `server`.

The factory loads `.env` from the project root unless `KNOWLEDGE_SKIP_DOTENV=1`.

---

## Configuration keys

| Key | Env var | Default | Type |
|-----|---------|---------|------|
| `port` | `PORT` | `8787` | number |
| `rootDir` | — | computed | string |
| `knowledgeDir` | — | `<root>/knowledge` | string |
| `notesDir` | — | `<root>/knowledge/notes` | string |
| `categoriesDir` | — | `<root>/knowledge/categories` | string |
| `indexPath` | — | `<root>/knowledge/index.json` | string |
| `appDbPath` | `APP_DB_PATH` | `<root>/knowledge/app.sqlite` | string |
| `codexCommand` | `CODEX_COMMAND` | `codex` | string |
| `codexTimeoutMs` | `CODEX_TIMEOUT_MS` | `180000` | number |
| `codexJobMaxAttempts` | `CODEX_JOB_MAX_ATTEMPTS` | `3` | number |
| `codexJobRetryMs` | `CODEX_JOB_RETRY_MS` | `60000` | number |
| `aiFlashcardsDisabled` | `AI_FLASHCARDS_DISABLED` | `false` | boolean |
| `meiliHost` | `MEILI_HOST` | `http://localhost:7700` | string |
| `meiliMasterKey` | `MEILI_MASTER_KEY` | `''` | string |
| `meiliIndex` | `MEILI_INDEX` | `knowledge_notes` | string |
| `meiliSyncPath` | — | computed from meiliIndex | string |
| `noteStorage` | `NOTE_STORAGE` | `local` | `'local' \| 's3'` |
| `s3Endpoint` | `S3_ENDPOINT` | `''` | string |
| `s3Bucket` | `S3_BUCKET` | `''` | string |
| `s3Region` | `S3_REGION` | `auto` | string |
| `s3AccessKeyId` | `S3_ACCESS_KEY_ID` | `''` | string |
| `s3SecretAccessKey` | `S3_SECRET_ACCESS_KEY` | `''` | string |
| `s3Prefix` | `S3_PREFIX` | `notes/` | string |
| `searchProvider` | `SEARCH_PROVIDER` | `meilisearch` | `'meilisearch' \| 'inmemory'` |
| `aiProvider` | `AI_PROVIDER` | `codex` | `'codex' \| 'openrouter'` |
| `aiApiKey` | `AI_API_KEY` | `''` | string |
| `aiApiBaseUrl` | `AI_API_BASE_URL` | `https://openrouter.ai/api/v1` | string |
| `aiModel` | `AI_MODEL` | `anthropic/claude-3-5-sonnet` | string |
| `aiSystemPrompt` | `AI_SYSTEM_PROMPT` | `''` | string |
| `readOnly` | `KNOWLEDGE_READ_ONLY`, `READ_ONLY_MODE`, `CF_PAGES`, `WORKERS_CI` | `false` | boolean |

---

## Adding a new config key

1. Add the key to the return object in `configuration.ts`.
2. Inject `ConfigService` and call `config.get<Type>('yourKey')` at the use site.
3. Document the env var in `AGENTS.md`'s configuration reference table.
