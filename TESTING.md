# Testing Guide

Knowledge Loom uses the **Node.js built-in test runner** (`node:test`) with
`node:assert/strict`. TypeScript unit suites run under `tsx`; the e2e and
integration suites drive the compiled server (`server/dist`) over real HTTP.

## Running tests

```bash
npm run test:all         # everything below, in order
npm test                 # backend unit suites (tsx)
npm run test:frontend    # frontend pure-function suites (tsx)
npm run test:e2e         # builds server, boots it, drives every API area
npm run test:integration # AI pipeline (mock provider), server modes, MCP
npm run smoke:meili      # Meilisearch incremental-sync smoke test
```

Requirements: `npm run test:e2e` / `test:integration` need **Redis on
localhost:6379** (same as `npm run dev`; `docker compose -f
docker-compose.dev.yml up -d redis`). Suites skip themselves gracefully when
prerequisites are missing.

## The test pyramid

| Suite | Files | What it proves |
|---|---|---|
| Backend unit | `backend-*.test.ts` | note parser, storage repos, guards, reminders, FSRS scheduler, exam-plan builder, service normalization/parsing, stable card ids (against compiled dist) |
| Frontend unit | `frontend-*.test.ts` | learn-content deck/plan/podcast builders, lib utilities |
| e2e API | `e2e-api.test.mjs` | spawned server + temp vault: notes lifecycle, knowledge state, search, reminders, flashcards/quiz reviews, learn progress, study queue + stats, exam plan, shares (note + collection), marketplace lifecycle + ratings, jobs, images, error shapes, extensions smoke (skips without `dist/extensions`) |
| Integration: AI | `integration-ai.test.mjs` | mock OpenAI-compatible provider: research capture → job → note → search, retry exhaustion, assist parsing/link filtering, deck sanitizer, RAG + tutor-mode streaming, TTS voices, import (text/PDF/audio/image) |
| Integration: modes | `integration-modes.test.mjs` | AUTH_SECRET enforcement, read-only mode, 501s for unconfigured transcription/vision/TTS, security headers + public rate limiting |
| Integration: MCP | `integration-mcp.test.mjs` | real MCP SDK client over stdio: read-only tool gating, capture→search→read round-trip, schema validation, study queue |

## Isolation rules (important)

Spawned servers derive **all paths from `KNOWLEDGE_ROOT`** (never cwd) and
each suite sets it to a fresh temp dir — a test must never touch the real
`knowledge/` vault. Redis is isolated per suite via `REDIS_DB` (ai=15 and
flushed, modes=12, MCP=11, extensions=13); quota counters get unique
`EXT_QUOTA_PREFIX`es. AI is either `CODEX_COMMAND=false` (fail fast, zero
spend) or pointed at the suite's local mock server.

## Conventions

- File naming: `tests/backend-<subsystem>.test.ts`,
  `tests/frontend-<subsystem>.test.ts`, `tests/<kind>-<area>.test.mjs` for
  spawned-server suites.
- BDD style: each test states a behavior; prefer asserting observable API
  results over internals.
- Pure logic that needs unit tests lives in decorator-free modules
  (`server/src/scheduling/fsrs.ts`, `server/src/study/exam-plan.ts`,
  `server/src/learn-progress/progress-rollover.ts`) because `tsx` cannot
  parse NestJS parameter decorators; alternatively import from the compiled
  `server/dist` (see the stable-id tests).
- Fixtures live in `tests/fixtures/` (e.g. a real one-page PDF — hand-rolled
  minimal PDFs parse nondeterministically in pdf.js).

## extensions suites

The extensions repo has its own `tests/` (unit + integration) run by
`knowledge-loom-private/scripts/test.sh` against a linked build of this repo.
