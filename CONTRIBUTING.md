# Contributing to Knowledge Loom

## Development workflow

```bash
npm install            # Install all deps (root + server)
npm run dev            # Full stack: NestJS + Vite in parallel
npx tsc -p server/tsconfig.json --noEmit  # Type-check backend
npx tsc -b --noEmit   # Type-check frontend
npm run lint           # ESLint across all code
npm test               # Run backend tests
npm run test:frontend  # Run frontend tests
npm run build          # Production build
```

## Architecture principles

- **Markdown is the source of truth.** SQLite, Meilisearch, index.json, and category
  files are all derived. Every note mutation must call `KnowledgeService.rebuildIndexes()`.
- **Jobs are durable.** Every state transition persists to SQLite before the next step.
- **One Codex job at a time.** The queue is serial to avoid concurrent writes.
- **Read-only mode.** All write routes must use `@UseGuards(WritableGuard)`.

## Adding a feature

1. Create or update the entity/schema in `server/src/database/schema.ts`
2. Write a repository class in the feature folder (inject `DRIZZLE_DB`)
3. Write a service with business logic (no HTTP types)
4. Write a controller with route handlers (no business logic)
5. Create or update `*.module.ts` to wire providers
6. Import the module in `app.module.ts` if new
7. Add `@UseGuards(WritableGuard)` to write endpoints
8. Call `KnowledgeService.rebuildIndexes()` after note mutations
9. Add config keys to `configuration.ts` if new env vars are needed
10. Run type checks — must pass with 0 errors
11. Add all new user-visible strings to `en.json` AND every other locale file
12. Write a `spec.md` for the new module (see existing specs for format)
13. Write BDD-style tests (see TESTING.md)

## Code conventions

- **Controllers** handle HTTP only: validate input, call one service method, return the result.
- **Services** own business logic. No Express/HTTP types.
- **Repositories** own data access. Only one backend: DB, filesystem, or external API.
- **Partial merge** patterns for settings: read existing, shallow-merge, write back.
- **Polling-driven frontend**: `useKnowledge` polls every 2.5s. No WebSockets.
- **Prop drilling over Context**: App state flows through props. No Redux or Context.
- **CSS Modules** for feature components; global CSS for shared styles.
- **Always guard `if (!this.db)`** in repositories — the db is `null` in read-only mode.

## I18n

All user-visible strings must be translated into all 9 locales in the same commit.
Never rely on English fallback. Use the `useTranslation()` hook with the default
namespace. Plural keys follow i18next conventions (`key_plural`).

## Commit style

- Use imperative present tense: "add X", "fix Y", "refactor Z"
- Keep commits focused — one subsystem per commit
- Include i18n keys in the same commit as the feature

## Pull requests

- Run the full gate: `npm test && npm run test:frontend && npm run lint && npm run build`
- For AI/prompt changes, inspect at least one generated output
- For UI changes, test in light and dark themes
- For write-path changes, verify read-only mode still returns 403
