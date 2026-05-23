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

`App.tsx` calls `useKnowledge()`, renders the layout shell (Rail, utility bar,
ContextPanel, SearchOverlay, Toast stack), and wires props through react-router
`<Route>` elements.

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
| `/categories/*` | `CategoryRoute` | `CategoryIndex` | `components/categories/` |
| `/flashcards` | `FlashcardsRoute` | `FlashcardsPage` | `components/flashcards/` |
| `/notes/:id` | `NoteRoute` | `NoteDetail` | `components/notes/` |
| `/settings` | _(none)_ | `SettingsPage` | `components/settings/` |
| `/tags/:tag` | `TagRoute` | `TagIndex` | `components/tags/` |

---

## App (`src/App.tsx`)

Root component. ~145 lines after extracting `useKnowledge` and route wrappers.

**Responsibilities**
- Calls `useKnowledge()` to get all state, handlers, and derived data.
- Renders shell: `<Rail>`, utility bar (theme/compact/Desk toggle, search trigger),
  toast stack, `<SearchOverlay>`, and conditional `<ContextPanel>`.
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

## Home (`components/Home.tsx`)

**Route**: `/`

Main desk view. Shows `CaptureBox` (note creation form), the 6 most urgently
due reminders sorted by `remindAt`, and the 8 most recently created notes via
`NoteList`. A 60-second clock re-checks "Due now" status.

---

## CaptureBox (`components/capture/`)

**Route**: home page (`/`)
**CSS Module**: `CaptureBox.module.css`

Three capture modes toggled by header buttons:

| Mode | API `mode` | Behaviour |
|------|-----------|-----------|
| Research | `research` | AI researches topic and writes a note (durable queue) |
| Link | `link` | AI fetches URL and converts to a note (durable queue) |
| Write | `write` or `polish` | Direct save; optional AI polish via checkbox |

**Guidance section**: Shows writing instruction templates from `lib/guidance.ts`
(chips + free-text input). "Manage" button navigates to `/settings`.

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

## SettingsPage (`components/settings/SettingsPage.tsx`)

**Route**: `/settings`
**CSS Module**: `SettingsPage.module.css`

Guidance template CRUD management. Shows built-in and custom templates grouped
by mode (research / link / both). Inline editing for label, text, and mode.
Changes persist to `localStorage` via `lib/guidance.ts`. On change, notifies
parent via `onTemplatesChange` so `CaptureBox` picks up new templates immediately.

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
