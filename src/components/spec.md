# Frontend Components — Spec

All React components live in `src/components/`. They are pure presentation: they
receive props from `App.tsx`, call callbacks for mutations, and never fetch data
directly (except `SearchOverlay`, which calls the search API for backend search).
State that spans multiple components lives in `App.tsx`.

CSS class prefixes: `ci-*` = CategoryIndex, `ti-*` = TagIndex, `ni-*` = NoteIndex.
All styles are in `src/index.css` (no CSS modules, no Tailwind).

---

## App (`src/App.tsx`)

Root component and single source of truth for all application state.

**Responsibilities**
- Owns `KnowledgeState` (notes, categories, flashcards, graph) polled every 2.5 s.
- Owns `jobs`, `reminders`, `view`, `theme`, `compactMode`, `readOnly`, and `railOpen`.
- Drives the browser history API: every `navigate()` call pushes or replaces a
  URL, and `popstate` restores the view from the path on back/forward.
- Routes `view.kind` to the correct page component.
- Renders the left rail (sidebar) with category tree, tag list, and main nav.
- Renders the right context panel (connections, links, backlinks, file info) when
  a note is open.
- Fires toast notifications on job completion and save/delete events.

**View model**
```
View =
  | { kind: 'home' }
  | { kind: 'activity' }
  | { kind: 'flashcards', scope, value }
  | { kind: 'note', id }
  | { kind: 'category', id }
  | { kind: 'tag', tag, page }
```

URL ↔ View mapping lives in `viewFromPath` / `pathFromView`.

**Theme cycle**: `light → white → dark → light`, persisted in localStorage.

**Compact mode**: adds the `dense` CSS class to the root `div`; persisted in localStorage.

**Keyboard shortcuts** (global)
- `⌘K` — open search overlay
- `j` / `k` — move focus between note rows
- `Enter` — open focused note row
- `Escape` — close rail or search overlay

---

## ActivityPage

**Route**: `/activity`  
**Props**: `{ jobs, onOpenNote }`

Displays the durable Codex job queue split into "In flight" and "History"
sections. Jobs with `status === 'queued' | 'running'` are in flight; all others
are history.

Each job card shows: status (with animated pulse on active), time, attempt count,
job id, and topic. Completed jobs whose `note.id` is set are clickable and open
the note via `onOpenNote`.

---

## CaptureBox

**Route**: home page (`/`)  
**Props**: `{ onSubmit, readOnly }`

Note capture form with three modes toggled by tab buttons:

| Mode | Backend `mode` value | Behaviour |
|------|---------------------|-----------|
| Write note | `write` or `polish` | Synchronous direct write; AI polish is opt-in via checkbox |
| Research & write | `research` | Codex researches the topic and writes |
| Generate from link | `link` | Codex retrieves the URL and converts it |

**Keyboard**: `/` focuses the textarea; `⌘Enter` (or `Ctrl+Enter`) submits.

The "Write note" mode reveals a `metadata-grid` (category, tags, summary, links)
and an optional AI polish checkbox. Polish maps to `mode: 'polish'` in the API
payload.

Submit is disabled when required fields are empty (title for research, body for
draft, url for link) or when `readOnly` is true.

---

## CategoryIndex

**Route**: `/categories/:id`  
**Props**: `{ category, notes, categories, flashcards, onOpen, onOpenTag, onOpenCategory, onOpenFlashcards }`

Displays one category page:

- Breadcrumb nav that is fully clickable for nested paths.
- Inline header with note count, flashcard count, tag count, link count, and optional summary.
- Subcategory chips (direct children only, depth + 1).
- Tag frequency chips (top 14 tags in this category).
- Sortable note list (recent / oldest / most linked).

`categoryContains(parentId, childId)` is used to include notes from sub-folders
(e.g. a note in `Engineering/Backend` appears on the `Engineering` page).

---

## FlashcardsPage

**Route**: `/flashcards`  
**Props**: `{ flashcards, notes, categories, tagCounts, scope, value, onScopeChange, onOpenNote }`

Two modes: **browse** and **study**.

**Browse mode** shows:
- Scope selector (all / category / tag) + text search.
- Kind breakdown chips (concept, question, lesson, tradeoff, pattern).
- Card grid — clicking a tile starts a study session from that index.

**Study mode** shows:
- Progress bar + live rating counters.
- 3-D flip card with front (prompt) and back (lesson + note link).
- Rating buttons: Again / Hard / Good (keyboard: 1, 2, 3).
- Navigation: `←`/`→` arrows, `Space` to flip, `Esc` to exit, swipe support on touch.

Session done screen shows per-rating breakdown and an option to review again.

Scope resets all session state (`studying`, `studyIndex`, `ratings`, etc.) when
`scope` or `value` change.

---

## Home

**Route**: `/` (default)  
**Props**: `{ notes, categories, reminders, onOpen, onOpenTag, onCompleteReminder, onSubmit, readOnly }`

Main desk view. Renders `CaptureBox` at the top, then a reminders list (up to 6,
sorted by `remindAt`), then the 8 most recently created notes via `NoteList`.

The clock polls every 60 s to re-compute "Due now" states on reminders without a
full data refresh.

---

## MiniGraph

**Props**: `{ note, notes, onOpen }`

SVG force-layout substitute: a fixed radial layout centred on the current note.
Computes outgoing links (notes this note links to) and backlinks (notes that link
to this note but are not already in outgoing).

Outgoing links render as `var(--ink-2)` nodes; backlinks as `var(--ochre)`.
Clicking any satellite node calls `onOpen(id)`.

Rendered inside the right context panel by `App.tsx` when a note is open.

---

## NoteDetail

**Route**: `/notes/:id`  
**Props**: `{ note, notes, categories, markdown, onOpenCategory, onOpenTag, onDelete, onAssist, onCreateReminder, onCompleteReminder, onDeleteReminder, onSave, reminders, readOnly }`

Reader + editor for one note.

**Reader mode** renders:
- Clickable breadcrumb (category → note file).
- Tags, source URL / original request.
- Markdown body (parsed to blocks via `parseMarkdownBlocks`).
- Collapsible raw source drawer.
- Reminder form + active reminder list.

**Editor mode** (two tabs):
- *Normal edit*: title, summary, category, tags, live markdown editor, link picker.
- *AI prompt*: free-text instruction sent to `POST /api/notes/:id/assist`; returned
  proposal is applied to form state; user must still click Save.

**Live markdown editor**: contenteditable div-per-line with class-based styling
(`md-h1`, `md-h2`, etc.). Enter splits lines, Backspace at offset 0 merges,
Arrow keys move between divs. Paste inserts multi-line plain text.

**Caret restoration**: after programmatic body updates the component schedules a
`useLayoutEffect` to move the cursor to the saved `{ line, offset }` position.

Opening the editor snapshots the latest note props into local draft state, so
background polling doesn't wipe in-progress edits.

---

## NoteList

**Props**: `{ notes, categories, onOpen, onOpenTag? }`

Reusable list of `NoteRow` items. Used by `Home` (recent notes) and
`CategoryIndex` / `TagIndex` (filtered + sorted notes).

Each `NoteRow` shows: date, title, summary, up to 4 tag buttons, category dot
and name, tag and link counts. Clicking the row calls `onOpen(note.id)`; clicking
a tag button stops propagation and calls `onOpenTag(tag)`.

---

## SearchOverlay

**Props**: `{ open, onClose, notes, categories, onOpen }`

Command-palette style search overlay rendered at the root level by `App.tsx`.

**Search flow**:
1. On open transition, shows the 12 most recent notes as "Recent".
2. After 160 ms debounce, calls `GET /api/search?q=…&category=All`.
3. On network failure, falls back to local substring match across
   `noteSearchText(note)`.

**Keyboard**: `↑↓` navigate results, `Enter` opens, `Esc` closes, `⌘K` toggles.

The overlay only resets query + results when it transitions from closed to open
(`wasOpenRef`), not on every background `notes` refresh.

The footer shows the active engine (`meilisearch`, `local`, or `recent`) and hit count.

---

## TagIndex

**Route**: `/tags/:tag`  
**Props**: `{ tag, notes, categories, flashcards, page, onOpen, onOpenTag, onOpenCategory, onOpenFlashcards, onPage }`

Tag detail page:

- Compact header with note count, flashcard count, related tag count.
- Category distribution chips (which categories contain this tag).
- Related (co-occurring) tags with weighted font size.
- Sortable, paginated note list (10 notes per page; recent / oldest / most linked).

Sorting resets pagination to page 1. The `onPage` callback updates the URL
query string in `App.tsx` so browser back/forward preserves the page.
