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
| `/` | _(none)_ | `LandingPage` | `components/landing/` |
| `/home` | _(none)_ | `Home` | `components/Home.tsx` |
| `/activity` | _(none)_ | `ActivityPage` | `components/activity/` |
| `/categories` | `AllCategoriesRoute` | _(inline)_ | `components/routes/` |
| `/categories/*` | `CategoryRoute` | `CategoryIndex` | `components/categories/` |
| `/flashcards` | `FlashcardsRoute` | `FlashcardsPage` | `components/flashcards/` |
| `/login` | _(none)_ | `LoginPage` | `components/auth/` |
| `/new` | `NewNoteRoute` | _(inline)_ | `components/routes/` |
| `/notes/:id` | `NoteRoute` | `NoteDetail` | `components/notes/` |
| `/quiz` | `QuizRoute` | `QuizPage` | `components/quiz/` |
| `/settings` | _(none)_ | `SettingsPage` | `components/settings/` |
| `/tags` | `AllTagsRoute` | _(inline)_ | `components/routes/` |
| `/tags/:tag` | `TagRoute` | `TagIndex` | `components/tags/` |

Note: `/` serves `LandingPage` for unauthenticated visitors. `Home` is at `/home`
and renders the `CaptureBox` plus toggleable widgets.

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

## CaptureBox (`components/capture/`)

**Route**: home page (`/home`)
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

## Home (`components/Home.tsx`)

**Route**: `/home`

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

## NoteDetail (`components/notes/NoteDetail.tsx`)

**Route**: `/notes/:id` (via `NoteRoute` wrapper)

Note reader and editor.

**Reader mode**:
- Clickable category breadcrumb.
- Inline header with category pill, date, tag/link counts, edit/delete buttons.
- Markdown body rendered via TipTap `NoteViewer` (which includes Mermaid diagram support).
- Collapsible raw source drawer showing full markdown.
- `ReminderSection` — schedule + active reminder list.

**Editor mode** (two tabs):
- *Manual edit*: title, summary, category (with datalist suggestions), tags,
  TipTap `NoteEditor` for rich-text markdown body, `LinkEditor` for cross-note links.
- *AI prompt*: free-text instruction handled by inline AI assist in `NoteEditorForm`.
  Returns a proposal applied to form state; user must still click Save.

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
- `NoteEditorForm` — inline AI assist modal and save/cancel actions.
- `NoteEditor` — TipTap-based rich text markdown editor with formatting toolbar.
- `NoteViewer` — TipTap-based read-only markdown viewer with Mermaid diagram rendering.
- `ReminderSection` — datetime-local picker, reminder list with Done/Delete.
- `LinkEditor` — checkbox list of other notes, searchable by title/category/tag.
- `MetaFields` — category dropdown with search, tag chips with add/remove.

---

## NoteEditor (`components/notes/NoteEditor.tsx`)

TipTap-based rich text markdown editor used by `CaptureBox` (Write mode) and
`NoteDetail` (manual edit tab).

**Features**:
- Formatting toolbar: bold, italic, strikethrough, headings, blockquote, code,
  bullet/ordered list, horizontal rule, image upload, link insertion.
- Bubble menu on text selection for quick formatting.
- `Enter` creates new list items; `Shift+Enter` for soft breaks.
- Image upload calls `POST /api/images` and inserts the URL.
- Link insertion uses browser-native `window.prompt()`.
- Exposes `getMarkdown()` and `clear()` via `forwardRef` + `useImperativeHandle`.

## NoteViewer (`components/notes/NoteViewer.tsx`)

TipTap-based read-only markdown viewer. Renders parsed markdown with Mermaid
diagram support. Diagrams are rendered asynchronously (80ms delay after content
set) via `mermaid.run()`. Rendering errors add a CSS class `ne-mermaid-error`
without crashing the viewer.

## NoteEditorForm (`components/notes/NoteEditorForm.tsx`)

Edit form wrapper used inside `NoteDetail`'s editor mode. Manages title, summary,
category, tags, and the TipTap editor. Provides:
- AI assist modal: free-text instruction → calls `POST /api/notes/:id/assist`.
- Save button (calls `onSave`).
- Cancel button (exits editor without saving).

## MetaFields (`components/notes/MetaFields.tsx`)

Category and tag picker shared between `CaptureBox`, `NoteDetail`, and `NewNoteRoute`.
- Category dropdown with search against all known categories (120ms blur delay
  to allow click events on dropdown items).
- Tag chips with add (comma or Enter) and remove (X button with `aria-label`).
- Tag suggestions filtered from all known tags.

## ReminderSection (`components/notes/ReminderSection.tsx`)

Scheduled review reminder UI embedded in `NoteDetail` and `Home`.
- Datetime-local picker for setting a future review date.
- Active reminder list with "Done" and "Delete" actions.
- 60-second clock re-render to update overdue status in real time.
- Validates future dates with `Number.isNaN(selectedDate.getTime())`.

## LinkEditor (`components/notes/LinkEditor.tsx`)

Cross-note link picker. Shows checkboxes for all other notes (excluding the
current note), searchable by title, category, or tag. Uses `useMemo` for
filtering and includes counts (note count, selected count).

## AiAssistPanel (`components/notes/AiAssistPanel.tsx`)

AI instruction input component. **Note**: this component exists in the codebase
but is currently not imported by `NoteDetail` (the inline AI assist in
`NoteEditorForm` handles this flow instead). Kept for potential reuse.

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

## QuizPage (`components/quiz/`)

**Route**: `/quiz` (via `QuizRoute` wrapper)

Quiz study mode with three sub-views: Browse, Study, and the rating flow.

### QuizBrowse
Table of quiz questions. Each row shows type, question text, and source note.
Filters: all / category / tag scoping. Type filter dropdown for `fill-blank`,
`multiple-choice`, `short-answer`. Clicking a row opens a `QuizPreviewModal`
with the full question interaction (fill-blank input, multiple-choice radio
buttons, or short-answer textarea). Keyboard: Escape closes; Space/Enter reveals
the answer; Arrow keys or 1/2 rate after reveal.

### QuizStudy
Sequential question study session. Three question type renderers:
- **FillBlank**: text input with auto-check against the answer (case-insensitive trim).
- **MultipleChoice**: radio button options with correct/incorrect feedback.
- **ShortAnswer**: textarea for free-text answer, shows reference answer after reveal.

Rating: Correct / Wrong buttons after reveal. Spaced-repetition schedule
(1, 3, 7, 14 days) identical to the backend's `computeReview()`.
Progress bar and navigation (←/→).

### Constants
`NEXT_REVIEW_LABELS` maps streak numbers to human-readable labels.

---

## LandingPage (`components/landing/LandingPage.tsx`)

**Route**: `/`

Public marketing page for unauthenticated visitors.
- Hero section with value proposition.
- Feature highlights (hardcoded `FEATURES` array, not i18n-translated).
- Quick-capture demo via `CaptureBox` (no authentication required).
- "Get started" and "Sign in" links to `/login`.

---

## LoginPage (`components/auth/LoginPage.tsx`)

**Route**: `/login`

Supabase authentication page. Four modes:
- **Sign in**: email + password.
- **Sign up**: email + password (creates a new Supabase account).
- **Magic link**: email only (passwordless sign-in via Supabase magic link).
- **Magic link sent**: confirmation message after sending.

Error messages display in a `<p>` element after failed attempts. Form fields
use `<label htmlFor>` for accessibility. Uses `dangerouslySetInnerHTML` for
some translated messages — ensure translation strings contain no user input.

---

## LanguageSwitcher (`components/LanguageSwitcher.tsx`)

Dropdown rendered at the bottom of the `Rail` sidebar. Calls
the lazy-loading `changeLanguage(code)` helper on selection. Shows the current locale's native
name. Language preference is persisted to `localStorage` under key `kl:lang`.
Nine supported locales: English, 中文, 日本語, Español, Tiếng Việt, Bahasa Indonesia,
Bahasa Melayu, Français, हिन्दी.

---

## RichEditor (`components/RichEditor.tsx`)

TipTap-based rich text editor with markdown import/export. **Currently unused**
in the UI flow — `NoteEditor` handles the main editing needs. Kept as an
alternative editor option. Exposes `getMarkdown()`, `clear()`, and `focus()`
via `forwardRef` + `useImperativeHandle`.
