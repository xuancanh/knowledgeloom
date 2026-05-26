# Knowledge Loom — AI Agent Guide

This document describes the codebase for AI coding agents (Claude Code, Copilot,
Cursor, etc.). Read it before making changes so you understand the conventions,
the module boundaries, and where different concerns live.

---

## Repository layout

```
smart-knowledge-app/
├── src/                    # React frontend (Vite + TypeScript, ESM)
│   ├── components/         # UI components grouped by feature
│   │   ├── activity/       # ActivityPage + CSS module
│   │   ├── capture/        # CaptureBox + CSS module
│   │   ├── categories/     # CategoryIndex + CSS module
│   │   ├── chat/           # ChatPanel.tsx + ChatPanel.module.css (floating AI chat panel)
│   │   ├── flashcards/     # FlashcardsPage, browse/study/done sub-components, constants
│   │   ├── notes/          # NoteDetail, AiAssistPanel, ReminderSection, LinkEditor
│   │   ├── routes/         # URL→component wrappers (NoteRoute, CategoryRoute, NewNoteRoute, AllCategoriesRoute, AllTagsRoute, etc.)
│   │   ├── settings/       # SettingsPage + CSS module
│   │   ├── tags/           # TagIndex + CSS module
│   │   ├── ContextPanel.tsx  Rail.tsx  Home.tsx      # Layout / shell
│   │   ├── LiveEditor.tsx   NoteList.tsx              # Shared editor / list (LiveEditor.tsx is used by CaptureBox and NoteDetail)
│   │   ├── MiniGraph.tsx    SearchOverlay.tsx         # Shared widgets
│   │   └── RichEditor.tsx                             # TipTap-based editor, currently unused in UI flow
│   ├── hooks/              # Shared custom hooks
│   │   ├── useKnowledge.ts # Central state, polling, mutations, derived data
│   │   └── useRagChat.ts   # Chat message state, localStorage persistence, streaming abort
│   ├── i18n/               # Internationalisation (react-i18next)
│   │   ├── index.ts        # i18next init: language detection, localStorage persistence (kl:lang)
│   │   └── locales/        # One JSON file per locale (en, zh, ja, es, vi, id, ms, fr, hi)
│   ├── lib/                # Pure utility functions (no React imports except view.tsx)
│   │   ├── format.ts       # Date formatting
│   │   ├── guidance.ts     # Writing guidance template CRUD (localStorage)
│   │   ├── markdown.ts     # Legacy markdown→HTML converter
│   │   └── view.tsx        # Category tree builder, markdown parser, search helpers
│   ├── api.ts              # All fetch calls to /api/*
│   ├── types.ts            # Shared frontend types
│   ├── main.tsx            # Entry point (StrictMode + BrowserRouter)
│   ├── App.tsx             # Root component: layout shell + route table (~145 lines)
│   ├── index.css           # CSS import manifest (12 @import statements)
│   └── styles/             # Global CSS files (base, layout, rail, flashcards, etc.)
├── server/
│   ├── src/                # NestJS backend (TypeScript, CommonJS)
│   │   ├── ai/             # Pluggable AI provider (Codex / OpenRouter)
│   │   ├── codex/          # AI note creation + edit assistant
│   │   ├── common/         # Guards, note-parser utility
│   │   ├── config/         # Typed configuration factory
│   │   ├── database/       # Drizzle ORM setup + DDL
│   │   ├── flashcards/     # AI flashcard generation + cache
│   │   ├── jobs/           # Durable Codex job queue
│   │   ├── images/         # POST /api/images — image upload
│   │   ├── knowledge/      # Index rebuild pipeline
│   │   ├── learn/          # Note capture endpoint
│   │   ├── notes/          # Note CRUD
│   │   ├── rag/            # POST /api/rag/stream — streaming RAG over the knowledge base
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
├── tests/
│   ├── backend-storage.test.mjs   # Legacy job/flashcard repository tests
│   └── frontend-lib.test.mjs      # Pure function tests (format, view, guidance)
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

The `AiProvider` interface exposes two methods:

```typescript
interface AiMessage { role: 'system' | 'user' | 'assistant'; content: string; }

interface AiProvider {
  complete(prompt: string, opts?: AiCompletionOptions): Promise<string>;
  completeStream(messages: AiMessage[], opts?: AiCompletionOptions): AsyncGenerator<string>;
}
```

`complete()` is used by note creation (Codex queue) and flashcard generation.
`completeStream()` is used by RAG streaming. `CodexAiProvider` provides a non-streaming
fallback (yields the full `complete()` result as one chunk). `OpenRouterAiProvider` uses
OpenAI SSE streaming.

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

6. **Route ordering in controllers.** Static routes (e.g. `POST 'assist-draft'`) must
   be declared before parameterized routes (e.g. `POST ':id/assist'`) in the same
   controller to prevent Express treating the static segment as a parameter value.

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

# Lint all code
npm run lint

# Run backend tests
npm test

# Run frontend tests
npm run test:frontend

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

## Frontend architecture

### State management

All global state lives in the `useKnowledge` custom hook (`src/hooks/useKnowledge.ts`).
`App.tsx` calls this hook and distributes values via props. There is no Context
or Redux — the single hook + prop drilling pattern keeps data flow explicit.

**What lives in `useKnowledge`:**
- `state` (notes, categories, graph, flashcards) — polled every 2.5 s
- `jobs`, `reminders` — polled with knowledge
- `searchOpen`, `railOpen`, `theme`, `compactMode` — UI preferences
- `toasts` — transient notification stack
- `templates` — writing guidance templates (localStorage-backed)
- All mutation handlers (`handleDelete`, `handleSaveNote`, `submitCapture`, etc.)
- All navigation callbacks (`openNote`, `openCategory`, `openTag`, etc.)
- All derived state (`categories` with UI props, `categoryTree`, `tagCounts`)

> Chat state (messages, streaming) lives in `useRagChat` (`src/hooks/useRagChat.ts`),
> separate from `useKnowledge`. Chat history is persisted to localStorage under
> `kl:chat-history` (max 200 messages).

### Component organization

**Feature directories** contain a page component + its CSS Module (co-located):
```
components/activity/      ActivityPage.tsx + ActivityPage.module.css
components/capture/       CaptureBox.tsx + CaptureBox.module.css
components/categories/    CategoryIndex.tsx + CategoryIndex.module.css
components/chat/          ChatPanel.tsx + ChatPanel.module.css
components/flashcards/    FlashcardsPage.tsx + browse/study/done + constants/types
components/notes/         NoteDetail.tsx + AiAssistPanel/ReminderSection/LinkEditor
components/settings/      SettingsPage.tsx + SettingsPage.module.css
components/tags/          TagIndex.tsx + TagIndex.module.css
```

**Shared components** (no CSS module, used across features) stay flat:
```
LiveEditor.tsx    NoteList.tsx    MiniGraph.tsx  SearchOverlay.tsx
Rail.tsx          Home.tsx        ContextPanel.tsx
```

**Route wrappers** (`components/routes/`) extract URL params and delegate
to page components. They are the only components that use `useParams()`
and `useSearchParams()`.

### Component design rules
- **Page components** receive all data via props; never call `fetch()`.
  Exception: `SearchOverlay` calls `searchKnowledge()` directly.
- **Sub-components** (AiAssistPanel, FlashcardBrowse, etc.) own their
  local form/UI state and call callbacks for mutations.
- **Custom hooks** are preferred over HOCs or render props. Hooks that
  serve one component stay in that component's folder. Promote to
  `src/hooks/` when needed by 2+ features.
- **No nested render functions** — extract them to module-level components.
- **CSS Modules** for feature components; global CSS in `src/styles/` for
  shared styles (layout, rail, base variables, common widgets).

### Route table

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `Home` | Landing / empty state |
| `/notes/:id` | `NoteRoute` | Note detail view |
| `/categories/:id` | `CategoryRoute` | Category view |
| `/tags/:tag` | `TagRoute` | Tag view |
| `/flashcards` | `FlashcardsRoute` | Flashcard study |
| `/activity` | `ActivityPage` | Job activity log |
| `/new` | `NewNoteRoute` | Full-page write editor; reads draft from `sessionStorage` key `kl:new-note-draft` |
| `/categories` | `AllCategoriesRoute` | All categories overview with tree view |
| `/tags` | `AllTagsRoute` | All tags overview |

### Data flow
```
useKnowledge hook (polling + state)
  └→ App.tsx (route table + layout)
       ├→ Route wrappers (URL → props)
       │    └→ Page components (props → UI)
       │         └→ Sub-components (local state + callbacks)
       ├→ Rail (sidebar nav, category tree, tag list)
       ├→ ContextPanel (right sidebar, connections graph)
       ├→ SearchOverlay (command palette, calls API directly)
       └→ ChatPanel (floating AI chat, available on all routes)
```

### App.tsx responsibilities
- Calls `useKnowledge` and distributes state via props.
- Declares the top-level route table (see table above).
- Renders the layout shell: `Rail`, `ContextPanel`, `SearchOverlay`.
- Renders `<ChatPanel>` (floating AI chat button + sliding panel) at the root level so it is available on all routes.

### API layer (`src/api.ts`)
- Every backend endpoint has a matching exported async function.
- Functions return typed responses (no `any`).
- Error handling: throw on non-2xx with status code in message.
- `NoteUpdate` type is the canonical editor draft format.
- `streamRagAnswer(question, scope, history, signal?)` — returns `AsyncGenerator<string>` consuming the RAG chunked stream.
- `assistDraft(draft, prompt)` — AI assist for unsaved capture-box drafts (calls `POST /api/notes/assist-draft`).

### Lib layer (`src/lib/`)
- Pure utility functions (no React imports, except `view.tsx` which has
  JSX for `highlightText`).
- `view.tsx` — category tree builder, markdown parser, search helpers,
  UI category augmentation.
- `guidance.ts` — writing guidance template CRUD backed by localStorage.
- `format.ts` — date formatting (formatJobDate, toLocalDateTimeInputValue).
- `markdown.ts` — legacy HTML converter (unused in current UI flow).

### Styling
- **CSS Modules** (`*.module.css`): Co-located with feature components.
  Imported as `import styles from './Foo.module.css'`. Classes referenced
  via `styles.foo`.
- **Global CSS** (`src/styles/*.css`): Layout shell, rail sidebar, search
  overlay, flashcards, base variables, common widgets. Imported via
  `@import` in `src/index.css`.
- **CSS variables** in `base.css` define 3 complete theme palettes
  (`light`, `white`, `dark`). Theme is toggled via `documentElement.dataset.theme`.
- When adding a new feature component, prefer a co-located CSS Module.
  Use global CSS only for styles shared by multiple feature components.

---

## Component details

### CaptureBox (`components/capture/CaptureBox.tsx`)

Multi-mode note-capture widget. Mode is toggled via a tab bar at the top.

| Mode | Description |
|------|-------------|
| Quick | Plain-text quick note |
| Write | Full markdown note with title, category, tags |
| Link | URL bookmarking with title + notes |
| Voice | Voice memo (transcription via backend) |

**Write tab specifics:**
- **AI Assist** button opens a popup modal where the user types an instruction; calls `POST /api/notes/assist-draft` and applies the returned text to the form.
- **Full Editor** button saves the current draft to `sessionStorage` key `kl:new-note-draft` and navigates to `/new`.

**Guidance chips** appear below the mode bar. Each chip corresponds to a writing guidance template. When the template has a `color` field, the chip shows a **colored dot** using that color. The active chip uses the template color as its text/border color.

### NoteDetail (`components/notes/NoteDetail.tsx`)

Displays an individual note. Supports read mode and edit mode.

- When in editing mode, the "Reading mode" button is renamed to **"Focus mode"** to better describe its purpose (dims chrome, expands width, allows font-size adjustment).
- Font size controls in reading/focus mode inject a `<style>` tag that targets `body.reading .note-detail .ne-view-content .tiptap` with `!important` to override the editor's base styles.

### SettingsPage (`components/settings/SettingsPage.tsx`)

Application settings and configuration UI.

- Each guidance template now supports an optional **color** field (CSS variable name, e.g. `moss`, `indigo`, `teal`). Color swatches are shown as 20 px circles using the `--swatch-color` CSS variable. The CaptureBox chips reflect the selected color.

### FlashcardBrowse (`components/flashcards/FlashcardBrowse.tsx`)

Grid of flashcard tiles. Clicking a tile opens a `CardPreviewModal` — a 3-D flip-card popup — rather than starting a full study session. The modal reuses the same `.fc-face .fc-front` / `.fc-face .fc-back` CSS as the study view. Keyboard shortcuts in the modal: Space/Enter reveals the back face; 1=Again, 2=Hard, 3=Good rates the card (calls `reviewFlashcard` and fires `onRated`); Escape closes. Tile props: `onRated(cardId, rating)`, `onOpenNote(noteId)`.

### QuizBrowse (`components/quiz/QuizBrowse.tsx`)

Table of quiz questions. Clicking a row opens a `QuizPreviewModal` — an interactive inline study card — instead of expanding the answer inline. Three inner components handle question types: `FillBlankPreview`, `MultipleChoicePreview`, `ShortAnswerPreview`. Keyboard: Escape closes; Space/Enter (outside inputs) reveals the answer; Arrow keys or 1/2 rate after reveal. Rating calls `onRate(question, rating)` which triggers `reviewQuiz`.

---

## Internationalisation (i18n)

All user-visible strings are translated via **react-i18next v17**. The single `translation` namespace is the default — components call `useTranslation()` with no namespace argument.

```typescript
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
// t('flashcards.browse.title') → "My Flashcards"
```

**Locale files** live at `src/i18n/locales/{lang}.json` (flat nested JSON). Nine locales ship: `en`, `zh`, `ja`, `es`, `vi`, `id`, `ms`, `fr`, `hi`.

**Language persistence**: the selected language is stored in `localStorage` under the key `kl:lang`. `src/i18n/index.ts` initialises i18next with `languageDetector` falling back to `en`.

**LanguageSwitcher** (`components/LanguageSwitcher.tsx`): a dropdown rendered inside `Rail.tsx` at the bottom of the sidebar. Calls `i18n.changeLanguage(code)` on selection.

**Adding a locale**: create `src/i18n/locales/{lang}.json` mirroring the `en` key structure. Caution: ASCII double-quotes inside JSON string values must be escaped as `\"` or replaced with language-appropriate quote marks (e.g. Chinese corner brackets `「」`) — bare `"` breaks the JSON parser.
