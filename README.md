# Knowledge Loom

A second brain that makes you learn. Capture knowledge as markdown notes —
written by you, researched by AI, or imported from PDFs, lecture recordings,
photos of handwritten notes, and web pages — and Knowledge Loom turns it into
study material automatically: flashcards and quizzes on an FSRS spaced-repetition
schedule, guided learn sessions with an optional two-host podcast, a Socratic
AI tutor that cites your own notes, exam-day study plans, and retention
analytics that show what you actually remember.

## Quick start (Docker)

```bash
docker compose up -d
open http://localhost:8787
```

That's the full stack: the app (web + API in one container), Redis (job
queue), and Meilisearch (full-text search). Notes and databases persist in
Docker volumes. To unlock the AI features, pass any OpenAI-compatible key:

```bash
AI_API_KEY=sk-... AI_MODEL=anthropic/claude-sonnet-5 docker compose up -d
```

Exposing it beyond localhost? Set `AUTH_SECRET` (bearer token required on all
API calls) or front it with your own auth proxy.

## Develop locally

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d   # redis + meilisearch (+ postgres)
npm install
npm run dev                                       # API :8787 + Vite :5174
```

## Stack

- **Frontend**: Vite + React + TypeScript SPA (installable PWA).
- **Backend**: NestJS (`server/src`), compiled to `server/dist`.
- **Source of truth**: markdown files under `knowledge/users/<user>/notes`
  (or any S3-compatible bucket via `NOTE_STORAGE=s3`).
- **Databases**: SQLite by default; PostgreSQL via `DATABASE_DIALECT=postgres`.
- **Queue**: BullMQ on Redis for durable AI jobs.
- **Search**: Meilisearch (default) or zero-dependency in-memory provider.
- **AI**: pluggable — the `codex` CLI locally, or any OpenAI-compatible HTTP
  API (`AI_PROVIDER=openrouter`); same pattern for transcription
  (`TRANSCRIBE_*`), vision import (`VISION_*`), and podcast TTS (`TTS_*`).

## Project shape

```text
src/                     React UI (components by feature, api client, hooks)
server/src/              NestJS modules: notes, knowledge, learn, flashcards,
                         quiz, study (Today queue/exam/stats), import, rag,
                         shares, marketplace, tts, jobs, auth, usage seams
mcp/                     Model Context Protocol server (stdio) — docs/MCP.md
tests/                   unit + integration + e2e suites (see TESTING.md)
knowledge/               your data (gitignored) — notes, sqlite, search manifests
docker-compose.yml       one-command self-hosted stack
docker-compose.dev.yml   infra only, for npm run dev
infra/, Dockerfile       production deployment — docs/DEPLOYMENT.md
```

Deep dives: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/AI_SPEC.md](docs/AI_SPEC.md) · [docs/ROADMAP.md](docs/ROADMAP.md) ·
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) · [docs/MCP.md](docs/MCP.md)

## Features

- **Capture**: write directly, let AI polish a draft, research a topic, or
  clip a URL (bookmarklet in Settings).
- **Import**: PDF, text/markdown, audio/video (Whisper-compatible
  transcription), and images/handwriting (vision extraction) — every import
  becomes a note with flashcards and quiz questions.
- **Study**: the Today queue merges everything due; FSRS-4.5 schedules both
  flashcards and quizzes; exam mode lays out a day-by-day plan toward a date;
  stats show 1d+/7d+ recall and your weakest topics.
- **Learn sessions**: slide decks or a two-host podcast (with real TTS audio
  when a key is configured), XP, streaks, mastery.
- **Ask & Tutor**: RAG chat over your notes, plus a Socratic tutor mode that
  quizzes you and cites every claim `[Note: "…"]`.
- **Share & marketplace**: publish read-only notes or whole collections at
  unguessable URLs; publish, browse, rate, and import community decks.
- **MCP server**: expose the vault to Claude and other MCP clients (stdio,
  read-only by default).

## Auth & open source

This repository is the open-source core, licensed **AGPLv3** (see `LICENSE`).
It runs in single-user local mode by default: no login, all data under
`userId="local"`. `AUTH_SECRET` adds bearer-token protection for exposed
instances.

Multi-user auth (Supabase), billing, quota, and the admin console live in a
private extensions repo merged into this tree at build time. OSS code never
imports `extensions/` (ESLint-enforced); extensions modules attach through explicit
seams. See `docs/OPEN_SOURCE_DECISION.md` for the full structure.

## Tests

```bash
npm run test:all   # unit + frontend + e2e + integration (needs redis)
npm run lint
```

See [TESTING.md](TESTING.md) for what each suite covers.

## Read-only mode

Set `KNOWLEDGE_READ_ONLY=1` to disable writes: capture and AI jobs are
rejected, mutation routes return 403, derived files and search sync are
skipped, and `/api/status` reports `{ "readOnly": true }`.
