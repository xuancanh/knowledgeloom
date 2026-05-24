# Notes Module — Spec

**Location**: `server/src/notes/`  
**NestJS modules**: `NotesModule`, `NotesFileModule`

The notes module is split into two sub-modules to avoid a circular dependency:

```
NotesModule → KnowledgeModule → NotesFileModule   ← no cycle
```

`NotesFileModule` owns only the repository (pure data access). `NotesModule`
owns the service and controller (business logic + HTTP).

---

## NotesFileModule / NoteFileRepository

Application-level repository. Sits between the service layer and the
`NoteStorageProvider` (injected as `NOTE_STORAGE`). Delegates all raw I/O to
the storage backend (local fs or S3); adds app-specific logic on top.

### Methods

**`findById(id): Promise<string | null>`**  
Finds the relative path of a note by id (e.g. `Engineering/2024-01-15-note.md`).
Scans `listFiles()` for a file whose basename matches `<id>.md`.

**`readAll(): Promise<KnowledgeNote[]>`**  
Lists all files and parses each into a `KnowledgeNote`. Used when only metadata
is needed (e.g. building prompts for Codex with the most recent 20 notes).

**`readAllSources(): Promise<NoteSource[]>`**  
Like `readAll()` but returns `{ file, markdown, note }[]`. Used by
`KnowledgeService` which needs the raw markdown for flashcard generation and
folder migration.

**`readMarkdown(id): Promise<string>`**  
Reads the raw markdown for one note. Throws 404 if not found.

**`write(relativePath, markdown): Promise<void>`**  
Delegates to `storage.write()`. Creates parent directories on local fs.

**`move(from, to, markdown): Promise<void>`**  
Delegates to `storage.move()`. Throws 409 if destination already exists.

**`delete(relativePath): Promise<void>`**  
Delegates to `storage.delete()`.

**`writeCategoryFiles(categories): Promise<void>`**  
Regenerates `knowledge/categories/*.md` files from the category list.
Only runs on local fs; skipped silently in S3 mode.

**`writeIndexJson(state): Promise<void>`**  
Writes the `KnowledgeState` snapshot to `knowledge/index.json`.
Skipped silently in S3 mode.

---

## NotesModule / NotesService

Business logic for individual note CRUD.

### `getMarkdown(id): Promise<string>`

Returns raw markdown for the note reader/editor. Calls `noteRepo.readMarkdown()`.

### `createFromDraft(draft): Promise<any>`

Creates a note from user-authored content (no Codex).

1. Validates `title` and `body` are present.
2. Generates a slug via `uniqueNoteSlug`.
3. Composes canonical markdown via `composeMarkdown`.
4. Writes to `noteRelativePath(slug, category)`.
5. Calls `knowledgeService.rebuildIndexes()`.
6. Returns `{ note, state, markdown, codexStatus: 'not-used' }`.

### `update(id, updates): Promise<any>`

Rewrites one note from editor data.

1. Finds the current file path via `findById`.
2. Parses the current markdown for defaults.
3. Composes a new markdown string from the merged fields.
4. Writes to the new path (category may have changed → different subfolder).
5. Deletes the old file if the path changed.
6. Rebuilds indexes.

### `delete(id): Promise<any>`

1. Finds and deletes the markdown file.
2. Removes all reminders for this note.
3. Calls `searchService.deleteDocument(id)` immediately (before rebuild) so
   search results are accurate right away.
4. Rebuilds indexes.

### `assistEdit(id, draft, instruction): Promise<any>`

Proxy to `CodexService.assistEdit()`. Returns a proposal; does not write to disk.

### `assistDraft(draft, instruction): Promise<any>`

AI assistance for unsaved capture drafts. Called from `CaptureBox` before a note exists.

1. Delegates to `CodexService.assistDraft(draft, instruction)`.
2. `CodexService.buildDraftAssistPrompt()` builds a prompt that treats the draft
   body as-is (no "current saved note" comparison).
3. Returns a `NoteUpdate` proposal. The frontend applies it to the capture form;
   the user saves through the normal `POST /api/learn` route.

This path is intentionally separate from `assistEdit()` to keep unsaved-draft
assistance distinct from saved-note editing.

---

## NotesController

```
GET    /api/notes/:id           → { markdown }
PUT    /api/notes/:id           → { note, state, markdown }    @UseGuards(WritableGuard)
PATCH  /api/notes/:id           → same as PUT                  @UseGuards(WritableGuard)
DELETE /api/notes/:id           → { deleted, state }           @UseGuards(WritableGuard)
POST   /api/notes/assist-draft  → { update, codexStatus }      @UseGuards(WritableGuard)
POST   /api/notes/:id/assist    → { update, codexStatus }      @UseGuards(WritableGuard)
```

`PUT` and `PATCH` share the same service method (`notesService.update`).

The `assist-draft` route must be declared **before** `POST /api/notes/:id/assist`
in the controller file to prevent Express from treating `"assist-draft"` as a
note ID parameter.

The `assist` route validates that `body.prompt` is a non-empty string before
delegating; the service handles all other validation.

---

## Module imports

`NotesFileModule` imports `StorageModule`.

`NotesModule` imports `NotesFileModule`, `KnowledgeModule`, `RemindersModule`,
`SearchModule`, and `CodexModule`. `CodexModule` is required for both
`assistEdit()` and `assistDraft()`.
