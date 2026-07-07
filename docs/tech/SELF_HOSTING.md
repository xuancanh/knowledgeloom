# Self-hosting

Knowledge Loom is a single long-running NestJS process plus a static SPA. It
runs anywhere Docker does. This document covers the open-source, self-hosted
setup; the numbers stay small and the whole thing fits on one box.

## Quick start (Docker Compose)

```bash
cp .env.example .env
docker compose up -d
```

This starts the app, Redis (durable AI job queue), and Meilisearch (search).
The app serves the built SPA and the API on one port (`PORT`, default 8787).
Data persists in Docker volumes. To unlock AI features, set an
OpenAI-compatible key in `.env` (`AI_API_KEY`, `AI_PROVIDER=openrouter`).

## Environment

Full reference: [`.env.example`](../../.env.example). The variables you are
most likely to touch:

| Concern | Variable(s) | Notes |
|---|---|---|
| HTTP port | `PORT` | The one port the SPA + API are served on |
| Database | `DATABASE_DIALECT`, `DATABASE_URL` | `sqlite` (default, zero-config) or `postgres` |
| Note storage | `NOTE_STORAGE`, `S3_*` | `local` filesystem (default) or any S3-compatible bucket |
| Search | `SEARCH_PROVIDER`, `MEILI_*` | `meilisearch` (default) or `inmemory` (zero dependencies) |
| Job queue | `REDIS_HOST`, `REDIS_PORT` | Real Redis protocol (BullMQ), not a REST shim |
| AI / TTS / STT / vision | `AI_*`, `TTS_*`, `TRANSCRIBE_*`, `VISION_*` | Any OpenAI-compatible endpoints; unset = those features return `501` |
| Auth | `AUTH_SECRET` | Optional bearer token for an internet-exposed instance (single user) |
| Spaces | `MAX_SPACES` | Cap the number of spaces per user (unset/0 = unlimited) |
| Read-only | `KNOWLEDGE_READ_ONLY=1` | Serve an existing vault without allowing writes |

## Why the API is a long-running process

BullMQ workers hold Redis TCP connections, migrations run at boot,
better-sqlite3 is a native module, and import/TTS buffer real files on disk.
That means a persistent container (Docker host, VM, Fly.io, Railway,
`docker-compose.prod.yml`) — not a serverless/edge runtime.

## Migrations

The migration runner applies committed migrations at boot (see
`server/src/database/migrator.ts`), for both SQLite and Postgres. A deploy is
the migration rollout — there is no separate migrate step to run.

## Single-user vs. multi-user

Out of the box the server is single-user (`userId = 'local'`); put it behind a
reverse proxy or VPN, or set `AUTH_SECRET`. Multi-user identity (Supabase JWT,
SSO), usage metering, and billing are provided by optional private extension
modules that plug into the `AUTH_STRATEGY` and usage seams — they are not part
of the open-source build.
