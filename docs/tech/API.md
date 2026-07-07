# HTTP API Reference

Base URL: `http://localhost:8787`. All endpoints are JSON unless noted.

**Auth** — every `/api/*` route requires authentication except the marked
`public` ones. Local mode: no credentials (single user `local`);
`AUTH_SECRET` mode: `Authorization: Bearer <secret>`; cloud mode: Supabase
JWT bearer. Write routes additionally require the server not to be in
read-only mode (`403` otherwise).

**Errors** — every error is `{ "error": "message", ... }` with a matching
HTTP status. Structured errors keep extra fields (e.g. quota errors carry
`quota`, `used`, `plan` with `429`). Unconfigured optional AI features
(transcription, vision, TTS) return `501` with a message naming the env var.

**Rate limits** — unauthenticated endpoints are limited per IP
(`PUBLIC_RATE_LIMIT`, default 120 req/min → `429`).

**Spaces** — every data route accepts an optional `x-space-id` header
selecting one of the caller's spaces (isolated sub-workspaces). Omitted or
`default` = the built-in default space. An unknown or foreign space id is a
`404`, a malformed one a `400`. Settings and space management are per user
and ignore the header.

## Status & knowledge

| Method & path | Description |
|---|---|
| `GET /api/status` | `{ readOnly }` — liveness + mode |
| `GET /api/knowledge` | Full knowledge state: notes, categories, graph, enriched flashcards/quiz, read tracking, settings (cached, stale-while-revalidate) |
| `GET /api/search?q=&category=` | Full-text search; `{ engine, hits }`, falls back in-memory when Meilisearch is down |

## Capture & notes

| Method & path | Description |
|---|---|
| `POST /api/learn` | Capture: `mode` = `write` (sync) \| `polish` \| `research` \| `link` (async AI job → `202` + job id) |
| `GET /api/notes/:id` | Raw markdown |
| `PUT/PATCH /api/notes/:id` | Full/partial update (rebuilds indexes) |
| `DELETE /api/notes/:id` | Delete + cascade (reminders, search doc) |
| `POST /api/notes/assist-draft` · `POST /api/notes/:id/assist` | AI edit proposal (never writes) |
| `POST /api/notes/:id/regenerate` | Queue flashcard/quiz regeneration (`target`, `size`) |
| `POST /api/notes/:id/read` | Read tracking |
| `POST /api/notes/backfill-bilinks` | Upgrade mutual links to bidirectional |

## Import

| Method & path | Description |
|---|---|
| `POST /api/import` | multipart `file` (pdf/txt/md/audio/video/image) or JSON `{ text }` (+ `title`, `category`, `tags`) → `202` + job. Extraction: pdf-parse / Whisper-compatible transcription / vision |

## Jobs

| Method & path | Description |
|---|---|
| `GET /api/jobs` · `GET /api/jobs/:id` | Activity feed / poll one job (`queued`→`running`→`done`\|`error`) |

## Study

| Method & path | Description |
|---|---|
| `GET /api/study/today?newCap=` | Unified queue: due + new flashcards/quiz, reminders due today |
| `GET /api/study/stats?days=` | Retention analytics from the review-event log |
| `POST /api/study/exam-plan` | `{ examDate, scope? }` → day-by-day plan |

## Flashcards & quiz

| Method & path | Description |
|---|---|
| `POST /api/flashcards` · `PUT/DELETE /api/flashcards/:id` | User-authored card CRUD |
| `POST /api/flashcards/:id/review` | `{ rating: again\|hard\|good }` → FSRS state (server loads prior state) |
| `POST /api/quiz/:id/review` | `{ rating: correct\|wrong }` → FSRS + streak |
| `DELETE /api/quiz/:id` · `POST /api/quiz/:id/restore` | Hide / unhide a question |

## Learn sessions

| Method & path | Description |
|---|---|
| `GET /api/learn-progress` · `POST /api/learn-progress/award` · `POST /api/learn-progress/master/:noteId` | XP / streak / mastery |
| `POST /api/learn-progress/generate-deck` | AI study deck for one note (content-hash cached) |
| `GET /api/tts/config` · `POST /api/tts/podcast` | TTS availability / render dialogue → `audio/mpeg` |

## RAG chat & tutor

| Method & path | Description |
|---|---|
| `POST /api/rag/stream` | `{ question, scope, history, mode: chat\|tutor }` → plain-text token stream |

## Reminders, images, settings

| Method & path | Description |
|---|---|
| `GET/POST /api/reminders` · `PATCH/DELETE /api/reminders/:id` | Reminder CRUD (`?status=active\|due\|done`) |
| `POST /api/images` · `GET /api/images/:name` *(public)* | Upload / serve images (SVG served with a no-script CSP) |
| `PATCH /api/settings` | Per-user settings JSON |

## Shares

| Method & path | Description |
|---|---|
| `POST /api/shares` | `{ noteId }` or `{ category }` → `{ id, url, kind }` (128-bit id) |
| `GET /api/shares` · `DELETE /api/shares/:id` | List / revoke own shares |
| `GET /api/shares/:id/public` *(public)* | Self-contained payload: note or collection + flashcards + quiz. Cached ~30s |

## Spaces

| Method & path | Description |
|---|---|
| `GET /api/spaces` | `{ spaces, limit }` — the caller's spaces (default first); `limit` is the plan's max space count (`null` = unlimited) |
| `POST /api/spaces` | Create a space `{ name }` → `403` when the plan limit is reached (`MAX_SPACES` env self-hosted, subscription plan hosted) |
| `PATCH /api/spaces/:id` | Rename (`400` for the default space) |
| `DELETE /api/spaces/:id` | Delete the space **and all data inside it** (`400` for the default space) |

## Marketplace

| Method & path | Description |
|---|---|
| `GET /api/marketplace?q=&kind=&sort=rating\|imports` *(public)* | Browse listings |
| `GET /api/marketplace/:id` *(public)* | Listing + full payload + comments |
| `POST /api/marketplace/publish` | `{ shareId, title, description?, tags?, author? }` |
| `POST /api/marketplace/:id/import` | Clone notes into your vault with decks seeded (no AI cost) |
| `POST /api/marketplace/:id/rate` | `{ stars: 1–5, comment? }` — one per user, no self-rating |
| `GET /api/marketplace/mine` · `DELETE /api/marketplace/:id` | Own listings / unpublish |

## Extension endpoints (when `extensions/` is present)

Optional private extension modules add further endpoint groups (e.g. billing
and admin). They are not part of the open-source build; see the private repo.
