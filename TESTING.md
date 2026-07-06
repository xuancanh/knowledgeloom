# Testing Guide

Knowledge Loom uses **Node.js built-in test runner** (`node:test`) with
`node:assert/strict` for assertions. Tests run via `npx tsx --test`.

## Running tests

```bash
npm test              # Backend tests (SQLite integration)
npm run test:frontend # Frontend pure-function tests
npm run smoke:meili   # Meilisearch sync smoke test (requires Docker)
```

## Test structure

Tests are BDD-style: each test describes a behavior scenario.

```
tests/
├── backend-storage.test.ts     # SQLite jobs + flashcard_cache table tests
├── frontend-lib.test.ts        # Pure utility function tests (format, view, guidance)
├── backend-note-parser.test.ts # Note parsing/composition functions
├── backend-guards.test.ts      # WritableGuard unit tests
└── backend-reminders.test.ts   # Reminder CRUD with real SQLite
```

## Conventions

### File naming
- `tests/backend-<subsystem>.test.ts` for backend tests
- `tests/frontend-<subsystem>.test.ts` for frontend tests

### Test pattern (BDD)
```typescript
import test from 'node:test';
import assert from 'node:assert/strict';

test('parseNote extracts metadata from frontmatter', () => {
  // Given: a markdown note with frontmatter
  const md = `---
title: "Hello"
category: "Engineering"
tags: ["react", "typescript"]
---
# Hello
Body text.`;

  // When: we parse it
  const note = parseNote('2024-01-15-hello.md', md);

  // Then: all fields are extracted
  assert.equal(note.title, 'Hello');
  assert.equal(note.category, 'Engineering');
  assert.deepEqual(note.tags, ['react', 'typescript']);
});
```

### Mocking NestJS DI

For service tests that depend on injected providers, use plain object mocks:

```typescript
test('FlashcardsService normalizes AI output', async () => {
  const mockAi = { complete: async () => JSON.stringify({ flashcards: [...] }) };
  const mockCache = { load: async () => ({}), replace: async () => {} };
  const service = new FlashcardsService(
    mockAi as any,
    mockCache as any,
    /* other deps */
  );
  const result = await service.sync(noteSources, { force: true });
  assert.ok(Array.isArray(result));
});
```

### SQLite integration tests

For tests that need a real database:

```typescript
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const tempDir = mkdtempSync(join(tmpdir(), 'knowledge-test-'));
const sqlite = new Database(join(tempDir, 'app.sqlite'));
sqlite.exec(DDL);
const db = drizzle(sqlite, { schema: { ... } });

test.after(() => {
  sqlite.close();
  rmSync(tempDir, { recursive: true, force: true });
});
```

## Coverage goals

| Subsystem | Target | Current |
|-----------|--------|---------|
| Note parser (pure functions) | 100% | 0% |
| WritableGuard | 100% | 0% |
| Configuration | 90% | 0% |
| AI providers (mocked) | 80% | 0% |
| Flashcards service (mocked) | 80% | 0% |
| Quiz service (mocked) | 80% | 0% |
| Reminders (integration) | 80% | 0% |
| Jobs service (integration) | 70% | Partial |
| RAG service (mocked) | 70% | 0% |
| Frontend lib (pure functions) | 90% | 70% |
| Frontend api.ts (mocked) | 70% | 0% |

## What NOT to test

- NestJS module wiring (tested implicitly by the app booting)
- Drizzle ORM behavior (tested by the library itself)
- Third-party API responses (use mocks)
- CSS/styling (manual review)
- Simple pass-through controllers with no logic

## End-to-end API suite (added 2026-07)

`npm run test:e2e` builds the server and runs `tests/e2e-api.test.mjs`, which
spawns the compiled server against a temp working directory and drives every
feature area over real HTTP: note lifecycle (write/read/update/patch/delete),
knowledge state, search, reminders (incl. delete cascade), settings,
flashcards CRUD + SM-2 review, quiz reviews + hide/restore, learn progress
(XP award/clamp, mastery, generate-deck validation and no-AI degradation),
jobs, image upload/serve + mime rejection, and error paths. `CODEX_COMMAND=false`
makes AI calls fail fast so nothing is spent.

Requires redis on localhost (BullMQ, same as `npm run dev`) — the suite skips
itself when redis or the dist build is missing. When the extensions `extensions/`
tree is dev-linked, extensions data is isolated to the temp dir and two extensions smoke
tests run; deep extensions coverage lives in the private repo's own suites
(`knowledge-loom-private/scripts/test.sh`).

## Core integration suites (added 2026-07)

`npm run test:integration` runs two spawn-based suites (sequentially — they
own dedicated redis logical DBs):

- `tests/integration-ai.test.mjs` — the full AI pipeline against a mock
  OpenAI-compatible provider: research capture → BullMQ job → note on disk →
  knowledge state → search; provider failure → retries → job status `error`;
  assist-draft / note assist proposal parsing with unknown-link filtering;
  generate-deck sanitization against live provider output; RAG token
  streaming. Uses REDIS_DB=15 (flushed at start).
- `tests/integration-modes.test.mjs` — server modes: `AUTH_SECRET` bearer
  enforcement and `KNOWLEDGE_READ_ONLY` write rejection. REDIS_DB=12.

All spawned test servers set `KNOWLEDGE_ROOT` to a temp dir — the server
derives every data path from it (NOT from cwd), so suites can never touch
the real knowledge/ directory.
