# Frontend Components — Specification

All React components live in `src/components/`. They are organized by feature:
components with CSS Modules get their own directory; shared components stay flat.

---

## Architecture overview

### State management
`src/hooks/useKnowledge.ts` is the single source of global state. It holds
`KnowledgeState` (notes, categories, graph, flashcards), `jobs`, `reminders`,
UI preferences (`theme`, `compactMode`, `railOpen`, `searchOpen`), `toasts`,
and `templates`. Data is polled every 2.5 seconds. All mutation handlers and
navigation callbacks also live here.

`src/hooks/useRagChat.ts` manages AI chat state independently: the message
array, streaming flag, and abort controller. Chat history is persisted to
`localStorage` under key `kl:chat-history` (max 200 messages; streaming flag
stripped before write). This hook is consumed only by `ChatPanel`.

`App.tsx` calls `useKnowledge()`, renders the layout shell (Rail, utility bar,
ContextPanel, SearchOverlay, ChatPanel, Toast stack), and wires props through
react-router `<Route>` elements.

### Data flow
```
useKnowledge (polling, mutations, derived state)
  → App.tsx (layout + route table)
    → Route wrappers (URL params → props)
      → Page components (props → UI)
        → Sub-components (local state + callbacks)
```

### Styling
- **CSS Modules** (`*.module.css`) are co-located with feature components.
- **Global CSS** (`src/styles/*.css`) covers the layout shell, rail, search
  overlay, flashcards, and shared widget styles.
- Three theme palettes (`light`, `white`, `dark`) live in `base.css` as
  CSS custom properties.

---

## Route ↔ Component mapping

| URL | Route wrapper | Page component | Location |
|-----|--------------|----------------|----------|
| `/` | _(none)_ | `Home` | `components/Home.tsx` |
| `/activity` | _(none)_ | `ActivityPage` | `components/activity/` |
| `/categories` | `AllCategoriesRoute` | _(inline)_ | `components/routes/` |
| `/categories/*` | `CategoryRoute` | `CategoryIndex` | `components/categories/` |
| `/flashcards` | `FlashcardsRoute` | `FlashcardsPage` | `components/flashcards/` |
| `/new` | `NewNoteRoute` | _(inline)_ | `components/routes/` |
| `/notes/:id` | `NoteRoute` | `NoteDetail` | `components/notes/` |
| `/settings` | _(none)_ | `SettingsPage` | `components/settings/` |
| `/tags` | `AllTagsRoute` | _(inline)_ | `components/routes/` |
| `/tags/:tag` | `TagRoute` | `TagIndex` | `components/tags/` |

---

## App (`src/App.tsx`)

Root component. ~145 lines after extracting `useKnowledge` and route wrappers.

**Responsibilities**
- Calls `useKnowledge()` to get all state, handlers, and derived data.
- Renders shell: `<Rail>`, utility bar (theme/compact/Desk toggle, search trigger),
  toast stack, `<SearchOverlay>`, and conditional `<ContextPanel>`.
- Renders `<ChatPanel>` at the root level (outside `<Routes>`) so the floating
  AI chat button and sliding panel are available on every page.
- Wires props through `<Routes>` to route wrappers and page components.
- Applies `dense` CSS class when `compactMode` is on.
- Hides right sidebar (`no-right` class) when no note is selected.

---

## useKnowledge (`src/hooks/useKnowledge.ts`)

Custom hook — the single source of truth for application state. Exported for
potential reuse in tests or alternative root components.

**State held** (18+ useState):
- `state` (`KnowledgeState`) — notes, categories, graph, flashcards
- `jobs` (`LearnJob[]`) — durable Codex job queue
- `reminders` (`Reminder[]`) — active reminders
- UI: `searchOpen`, `theme`, `compactMode`, `readOnly`, `railOpen`
- Data: `toasts`, `templates`, `catSearch`, `tagSearch`

**Data loading**
- `loadAll()` fires immediately and every 2.5 s thereafter.
- Fetches knowledge, jobs, status, and reminders in one `Promise.all`.
- Detects newly-completed jobs and fires success toasts.

**Derived state** (useMemo)
- `categories` — `KnowledgeCategory[]` augmented with UI ids, colors, summaries.
- `categoryTree` — nested folder tree from flat category list.
- `categoryById` — flat map for O(1) lookup.
- `tagCounts` — sorted `[tag, count]` tuples.

**Navigation callbacks** — `openNote`, `openCategory`, `openTag`, `goHome`,
`openActivity`, `openSettings`, `openFlashcards`. Each calls `navigate()` with
the appropriate URL pattern.

**Mutation handlers** — `handleDelete`, `handleSaveNote`, `handleAssistNote`,
`submitCapture`, `handleCreateReminder`, `handleCompleteReminder`,
`handleDeleteReminder`. These call API functions and update state / navigate.

---

## useRagChat (`src/hooks/useRagChat.ts`)

Custom hook for AI chat state. Consumed exclusively by `ChatPanel`.

**State**: `messages: ChatMessage[]`, `streaming: boolean`.

**Persistence**: Messages are loaded from `localStorage` on mount (`kl:chat-history`
key, max 200 entries). The `streaming` flag is cleared on load so a half-finished
message from a crashed session never shows a blinking cursor. Saves are triggered
after streaming ends (not per-token) to avoid thrashing storage.

**Methods**:
- `sendMessage(text, scope)` — appends a user message and a streaming assistant
  placeholder, calls `streamRagAnswer()`, and accumulates tokens into the
  placeholder message.
- `abort()` — cancels the in-flight `AbortController`.
- `clearHistory()` — empties the message array and removes the localStorage entry.

**History passed to backend**: Only the settled messages at call time (not the
in-progress streaming message) are forwarded as conversation history.

---

## Home (`components/Home.tsx`)

**Route**: `/`

Main desk view. Shows `CaptureBox` (note creation form) plus three toggleable
widgets. Widget visibility is stored per-user in `userSettings.homeWidgets`
(a `{ daily, discover, recent }` boolean object). State is initialized from the
`userSettings` prop (passed from `KnowledgeState`) and saved to the server via
`PATCH /api/settings` on each toggle (fire-and-forget).

**Customise bar**: A "Customize" button in the crumbs row reveals chip toggles
for each widget. Chips show a colored dot (filled = visible, muted = hidden).

**Daily widget** (`widgets.daily`): A bordered card shown when there are
overdue reminders or due flashcards, or upcoming reminders. Two sections:

- *Due now* (`daily-due`): flashcard row (opens flashcard session) and one row
  per overdue reminder with Open / Done actions. Each row has a 3 px left pip —
  accent for flashcards, rust for reminders.
- *Upcoming* (`daily-upcoming`): slim list of non-overdue reminders, up to 3.
  Divided from the due section by a horizontal rule when both are present.

A 60-second clock re-checks overdue status.

**Discover widget** (`widgets.discover`): Shows up to 3 randomly selected
unread notes as card tiles (shufflable). Notes the user has already opened are
excluded using the `readNoteIds` set. Hidden when all notes have been read.

**Recent widget** (`widgets.recent`): The 6 most recently created notes via
`NoteList`, plus total note count.

---

## CaptureBox (`components/capture/`)

**Route**: home page (`/`)
**CSS Module**: `CaptureBox.module.css`

Three capture modes toggled by header buttons:

| Mode | API `mode` | Behaviour |
|------|-----------|-----------|
| Research | `research` | AI researches topic and writes a note (durable queue) |
| Link | `link` | AI fetches URL and converts to a note (durable queue) |
| Write | `write` | Direct save to markdown |

**Write tab extras**: Below the body editor, two action buttons appear:
- **AI Assist** — opens a modal popup with a textarea for a free-text instruction.
  On submit, calls `POST /api/notes/assist-draft` via `assistDraft()` and applies
  the returned `NoteUpdate` proposal to the form fields. The user still saves
  manually via the normal submit flow.
- **Full Editor** — serialises the current draft (title, body, category, summary,
  tags) to `sessionStorage` under key `kl:new-note-draft` and navigates to `/new`
  (the full-page `NewNoteRoute` editor).

**Guidance chips**: Chips show a **colored dot** when the template has a `color`
field (a CSS variable name like `moss`, `indigo`, `teal`). The active chip uses
that color for its text and border. Guidance choice is persisted per-mode in
`localStorage`.

**Keyboard**: `/` focuses the primary input; `⌘Enter` submits.

**More options** (expandable) exposes context, seed text, category hint, and
tag hints. The fields shown depend on the active mode.

---

## Rail (`components/Rail.tsx`)

Left sidebar with:
- **Main nav**: Capture, Search, Activity (with in-flight count), Flashcards
  (with total count), Settings.
- **Category tree**: hierarchical folder navigation built from `makeCategoryTree`.
  Supports inline filter search; switches between tree view and flat search results.
- **Tag list**: top 18 tags by note count; inline filter shows all matches.

On mobile (`railOpen`), renders as a fixed overlay with backdrop. Active
route is highlighted based on `useLocation()`.

---

## CategoryIndex (`components/categories/CategoryIndex.tsx`)

**Route**: `/categories/*` (via `CategoryRoute` wrapper)
**CSS Module**: `CategoryIndex.module.css`

Displays one category page:
- Breadcrumb navigation for nested paths.
- Header with note/flashcard/tag/link counts and summary.
- Subcategory chips (direct children, depth + 1).
- Tag frequency chips (top 12 tags in this category).
- Sortable note list (recent / oldest / most linked) via `NoteList`.
- **Unread filter**: "Unread only" toggle hides notes the user has already read (uses `readNoteIds` set passed from `CategoryRoute`).
- Include notes in sub-folders via `categoryContains()`.

---

## TagIndex (`components/tags/TagIndex.tsx`)

**Route**: `/tags/:tag` (via `TagRoute` wrapper)
**CSS Module**: `TagIndex.module.css`

Tag detail page with:
- Header with note, flashcard, and related tag counts.
- Category distribution chips for this tag.
- Related (co-occurring) tags with weighted display.
- Sortable, paginated note list (10 per page; recent / oldest / most linked).
- **Unread filter**: "Unread only" toggle hides notes the user has already read (uses `readNoteIds` set).
- Pagination updates the URL query string (`?page=N`) so back/forward works.

---

## NoteDetail (`components/notes/NoteDetail.tsx`)

**Route**: `/notes/:id` (via `NoteRoute` wrapper)

Note reader and editor.

**Reader mode**:
- Clickable category breadcrumb.
- Inline header with category pill, date, tag/link counts, edit/delete buttons.
- Markdown body rendered via `parseMarkdownBlocks` (headings, quotes, paragraphs).
- Collapsible raw source drawer showing full markdown.
- `ReminderSection` — schedule + active reminder list.

**Editor mode** (two tabs):
- *Manual edit*: title, summary, category (with datalist suggestions), tags,
  `LiveEditor` for markdown body, `LinkEditor` for cross-note links.
- *AI prompt*: free-text instruction (handled by `AiAssistPanel`). Returns
  a proposal applied to form state; user must still click Save.

Opening the editor snapshots the latest note props into local draft state,
so background polling doesn't overwrite in-progress edits.

**Reading / Focus mode**: Toggled by the "Read" button in the reader header.
When in editing mode, the button is labelled **"Focus"** instead. Focus mode
adds `body.reading` class and injects a `<style>` tag targeting
`body.reading .note-detail .ne-view-content .tiptap` with `!important` to
override the editor's base font size. Font size (`s` / `m` / `l`) and content
width are adjustable via controls shown in focus mode only.

**Read tracking**: `NoteRoute` silently calls `POST /api/notes/:id/read` on every
note open. The read count for the note (from `readCounts`) is displayed in the
reader header as a small annotation (e.g. "3 reads").

**Sub-components**:
- `AiAssistPanel` — AI instruction input, runs `/api/notes/:id/assist`.
- `ReminderSection` — datetime-local picker, reminder list with Done/Delete.
- `LinkEditor` — checkbox list of other notes, searchable by title/category/tag.

---

## LiveEditor (`components/LiveEditor.tsx`)

Reusable contentEditable line-based markdown editor. Used by `CaptureBox`
(Write mode) and `NoteDetail` (manual edit tab).

**Props**: `placeholder`, `disabled`, `className`, `initialValue`.

**Imperative handle**: `getValue()`, `setValue(markdown)`, `clear()`, `focus()`.

Each line is a contentEditable `<div>`. The component applies `md-line` classes
(`md-h1`, `md-h2`, `md-h3`, `md-quote`, `md-list`, `md-code`) based on line prefix
for live styling. Enter splits lines; Backspace at offset 0 merges with the
previous line; Arrow keys navigate between lines. Paste inserts multi-line
plain text. Caret position is restored via `useLayoutEffect` after programmatic
line changes.

---

## NoteList (`components/NoteList.tsx`)

Reusable note list with three view modes: `list`, `grid`, `compact`.

Each item shows date, title, summary, up to 4 tag buttons, category dot + name,
and tag/link counts. Clicking the row opens the note; clicking a tag button
calls `onOpenTag`.

Used by `Home` (recent notes), `CategoryIndex`, and `TagIndex`.

---

## SearchOverlay (`components/SearchOverlay.tsx`)

Command-palette search rendered at root level by `App.tsx`.

**Behaviour**:
1. On open, shows 12 most recent notes ("Recent").
2. After 160 ms debounce, calls `GET /api/search?q=…&category=All`.
3. Falls back to local substring match on network failure.

**Keyboard**: `↑↓` navigate results, `Enter` opens, `Esc` closes, `⌘K` toggles.

The overlay resets only on open→close→open transitions (`wasOpenRef`), not
on background poll refreshes. Footer shows active engine and hit count.

---

## FlashcardsPage (`components/flashcards/`)

**Route**: `/flashcards` (via `FlashcardsRoute` wrapper)

Three sub-modes, each in its own component:

### FlashcardBrowse
Grid of AI-generated flashcard tiles. Each tile shows kind (color-coded dot +
label), prompt text, and source note title. Clicking starts a study session from
that index. Filters: all / category / tag scoping. Kind breakdown bar shows counts
per card type.

### FlashcardStudy
3-D flip card experience:
- **Front**: kind label, prompt, note reference, "Space to reveal" hint.
- **Back**: prompt repeated, lesson text, clickable note link.
- **Rating**: Again (1) / Hard (2) / Good (3) buttons after flip.
- **Navigation**: ←/→ buttons, ArrowLeft/Right keys, touch swipe.
- **Progress**: bar + live rating counters in top bar.
- **Escape** exits the session.

Slide animation is 250 ms with 280 ms for session-complete transition,
managed via `setTimeout` and a mutable ref for cleanup.

### FlashcardDone
Session completion screen: star icon, session stats, per-rating breakdown
(Again / Hard / Good counts), "Review again" button, and "Back to collection"
link.

---

## ActivityPage (`components/activity/ActivityPage.tsx`)

**Route**: `/activity`
**CSS Module**: `ActivityPage.module.css`

Durable Codex job queue with filter tabs (All / Active / Done / Failed).
Each job card shows status (with animated pulse for running), formatted
timestamp (`formatJobDate`), category, topic, and error if any. Completed
jobs with `note.id` are clickable and navigate to the note.

---

## NewNoteRoute (`components/routes/NewNoteRoute.tsx`)

**Route**: `/new`
**CSS Module**: `NewNoteRoute.module.css`

Full-page write editor for new notes. Renders a large title input, italic
summary textarea, `LiveEditor` for the markdown body, and `MetaFields`
(category, tags) in a bottom section.

On mount, reads a draft from `sessionStorage` under key `kl:new-note-draft`
(written by `CaptureBox`'s "Full Editor" button) and pre-populates all fields.
The key is removed immediately after reading so the draft is consumed once.

Save calls `onSubmit({ mode: 'write', title, body, category, summary, tags })`.
Cancel navigates back. The `NEW_NOTE_DRAFT_KEY` constant is exported from this
file for use by `CaptureBox`.

---

## AllCategoriesRoute (`components/routes/AllCategoriesRoute.tsx`)

**Route**: `/categories`

Overview of all categories with a tree view and count summaries. Receives
`categories` and `categoryTree` from `App.tsx` via `useKnowledge`.

---

## AllTagsRoute (`components/routes/AllTagsRoute.tsx`)

**Route**: `/tags`

Overview of all tags sorted by note count. Receives `tagCounts` from `App.tsx`.

---

## SettingsPage (`components/settings/SettingsPage.tsx`)

**Route**: `/settings`
**CSS Module**: `SettingsPage.module.css`

Guidance template CRUD management. Shows built-in and custom templates grouped
by mode (research / link / both). Inline editing for label, text, and mode.
Each template supports an optional **color** field (a CSS variable name, e.g.
`moss`, `indigo`, `teal`). Colors are selected via 20 px circle swatches; the
active swatch renders with an outline ring via `--swatch-color` CSS variable.
Changes persist to `localStorage` via `lib/guidance.ts`. On change, notifies
parent via `onTemplatesChange` so `CaptureBox` picks up new templates immediately.

---

## ChatPanel (`components/chat/ChatPanel.tsx`)

**CSS Module**: `ChatPanel.module.css`

Floating AI chat interface available on every page, rendered at the root level
by `App.tsx` (outside `<Routes>`).

**Trigger**: A pill-shaped "Ask AI" button in the bottom-right corner
(`position: fixed`). The button hides itself (`display: none`) when the panel
is open to avoid overlapping the panel's own "Ask" send button.

**Panel**: Slides in from the right (400 px wide) using `transform: translateX`.
A transparent backdrop div sits behind the panel to dismiss it on outside click.

**Scope selector**: Auto-detects the current route on mount and on navigation:
- `/notes/:id` → `{ type: 'note', id }`
- `/tags/:tag` → `{ type: 'tag', tag }`
- `/categories/*` → `{ type: 'category', path }`
- anything else → `{ type: 'all' }`

Scope chips at the top let the user switch between the detected scope and "All
notes". The detected scope is reset when the route changes, but not when the
user manually selects a different scope within the same route.

**Messages**: User messages render in an accent-tinted left-bordered bubble.
Assistant messages render as plain body text. A blinking `2 px` cursor
(animated via `@keyframes blink`) indicates streaming in progress. Auto-scrolls
to the bottom on each new token.

**Input**: Auto-resizing textarea. `Enter` sends (or stops streaming if in
progress). `Shift+Enter` inserts a newline. `Escape` closes the panel. The send
button turns red ("Stop") while streaming.

**State**: Managed by `useRagChat` hook. History persists across page reloads
via `localStorage` (`kl:chat-history`, max 200 messages).

---

## ContextPanel (`components/ContextPanel.tsx`)

Right sidebar shown when a note is selected. Three sections:
1. **Connections** — `MiniGraph` SVG showing outgoing links and backlinks.
2. **Links out** — list of notes this note links to, clickable.
3. **Backlinks** — list of notes that link to this note, clickable.
4. **File** — path, vault location, index status.

---

## MiniGraph (`components/MiniGraph.tsx`)

Small radial SVG diagram centered on the current note. Outgoing links render
as `var(--ink-2)` nodes; backlinks as `var(--ochre)`. Clicking any satellite
node calls `onOpen(id)`. Legend explains the colors.

---

## RichEditor (`components/RichEditor.tsx`)

TipTap-based rich text editor with markdown import/export. **Currently unused**
in the UI flow but kept as an alternative editor option. Exposes `getMarkdown()`,
`clear()`, and `focus()` via `forwardRef` + `useImperativeHandle`.
