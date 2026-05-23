# Common — Spec

**Location**: `server/src/common/`

Shared utilities and guards with no module of their own. Import directly where needed.

---

## WritableGuard (`guards/writable.guard.ts`)

NestJS `CanActivate` guard that rejects mutation requests in read-only deployments.

```typescript
@UseGuards(WritableGuard)
```

Apply to any controller method that writes to disk, the database, or Meilisearch.

Reads `config.get('readOnly')`, which is `true` when any of these env vars is set
to `1`: `KNOWLEDGE_READ_ONLY`, `READ_ONLY_MODE`, `CF_PAGES`, `WORKERS_CI`.

Returns **HTTP 403** with `{ error: 'service is running in read-only mode' }` when blocked.

---

## note-parser.util.ts

Pure, stateless functions for reading and writing markdown notes. No side effects.
Safe to import anywhere without circular dependencies.

### Functions

**`parseNote(fileName, markdown): KnowledgeNote`**  
Extracts typed metadata from YAML front-matter using regex matches. Returns
defaults (`'Uncategorized'`, empty arrays) when fields are absent. The note `id`
is the base filename without `.md`.

**`composeMarkdown(fields): string`**  
Writes canonical markdown from note data. Produces a deterministic front-matter
block followed by the body. Calls `escapeFrontmatter` and `normalizeArray` to
sanitise all values before writing.

**`slugify(value): string`**  
URL-safe slug: lowercase, `[^a-z0-9]+` → `-`, max 72 characters.
Falls back to `note-<timestamp>` for empty input.

**`uniqueNoteSlug(title, notesDir): string`**  
Generates a date-prefixed slug (`YYYY-MM-DD-<slug>`) and appends `-2`, `-3`, …
until the id is not already used in `notesDir` (recursive check via
`noteIdExistsSync`).

**`noteRelativePath(noteId, category): string`**  
Maps a note id + category to a relative filesystem path, e.g.:
`Engineering/Backend/2024-01-15-drizzle-orm.md`

**`normalizeCategoryPath(value): string`**  
Trims and joins `/`-separated category parts. Returns `'Uncategorized'` for
empty input.

**`stripFrontmatter(markdown): string`**  
Removes the leading `---…---` block and returns the body only.

**`escapeFrontmatter(value): string`**  
Replaces `\n` with space and `"` with `\"` for safe embedding in YAML strings.

**`normalizeArray(value): string[]`**  
Accepts an array or comma-separated string; deduplicates and trims entries.

**`noteIdExistsSync(id, dir): boolean`**  
Synchronous recursive search through `dir` for a file named `<id>.md`.
