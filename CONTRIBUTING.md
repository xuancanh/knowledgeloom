# Contributing to Knowledge Loom

Thanks for contributing! By submitting a contribution you agree to license it
under the repository's license (**AGPL-3.0-or-later**, see `LICENSE`) and certify the
[Developer Certificate of Origin](https://developercertificate.org/) — sign
commits with `git commit -s` if asked.

## Development workflow

```bash
docker compose -f docker-compose.dev.yml up -d   # redis + meilisearch (+ postgres)
npm install            # Install all deps (root + server)
npm run dev            # Full stack: NestJS + Vite in parallel
npx tsc -p server/tsconfig.json --noEmit  # Type-check backend
npx tsc -b --noEmit   # Type-check frontend
npm run lint           # ESLint across all code
npm test               # Backend unit tests
npm run test:frontend  # Frontend unit tests
npm run test:all       # Full pyramid incl. e2e + integration (needs redis)
npm run build          # Production build
```

See [TESTING.md](TESTING.md) for the test pyramid and the isolation rules
every spawned-server test must follow (`KNOWLEDGE_ROOT`, `REDIS_DB`).

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

## Boundaries that CI enforces

- **Never import from `extensions/`** in core code (ESLint fence). Optional
  private modules attach only through the seams: the frontend extension
  registry (`src/lib/extensions.ts`), `AUTH_STRATEGY`, `USAGE_SERVICE`, and
  `AppModule.forRoot()`.
- **Never edit or reorder existing migrations** in
  `server/src/database/migrator.ts` — append a new one (sqlite + pg).
- Lint must pass with 0 errors (`any` and the React-compiler rules are
  tracked warnings; don't add new hard errors).

## Pull requests

- Run the full gate: `npm run lint && npm run build && npm run test:all`
- CI runs the same plus a Docker image build-and-boot smoke test
- For AI/prompt changes, inspect at least one generated output (the mock
  provider in `tests/integration-ai.test.mjs` shows the contract)
- For UI changes, test in light and dark themes
- For write-path changes, verify read-only mode still returns 403
- New AI-consuming endpoints must go through the `USAGE_SERVICE` quota seam

## Where things are documented

Docs: [docs/](docs/README.md) · AI-agent guide: [AGENTS.md](AGENTS.md) ·
Security policy: [SECURITY.md](SECURITY.md)
