# Knowledge Module — Spec

**Location**: `server/src/knowledge/`  
**NestJS module**: `KnowledgeModule`

---

## Purpose

The rebuild pipeline. Keeps every derived artifact (category markdown files,
`index.json`, Meilisearch, flashcard cache) in sync with the markdown source of
truth. Every mutating route in the app calls `KnowledgeService.rebuildIndexes()`
at the end.

---

## KnowledgeService

### `rebuildIndexes(): Promise<KnowledgeState>`

The central coordination method. Steps:

1. **Read all sources** — `NoteFileRepository.readAllSources()` returns
   `{ file, markdown, note }[]` for every `.md` file in the notes store.

2. **Migrate folders** *(write mode only)* — if a note's category front-matter
   disagrees with its on-disk path, move the file to the correct location.
   This makes every create/update idempotent: dropping a file at the root is
   always resolved to the correct subfolder on the next rebuild.
   Conflict (destination already exists) throws HTTP 409.

3. **Build categories** — aggregates notes into `CategoryEntry[]` keyed by
   the `category` front-matter value. Sorted alphabetically.

4. **Write category files** *(write mode only)* — `NoteFileRepository.writeCategoryFiles()`
   regenerates the `knowledge/categories/*.md` files from the category list.

5. **Build graph** — maps each note to `{ source, targets[] }` where targets
   are the intersection of `note.links` and the current set of note ids.
   Broken links are excluded from the graph but remain in the source markdown.

6. **Sync flashcards** — delegates to `FlashcardsService.sync(noteSources)`.
   AI calls are skipped for unchanged notes (hash comparison in the cache).

7. **Write index.json** *(write mode only)* — persists the full `KnowledgeState`
   snapshot for the frontend to read on next load.

8. **Sync search** *(write mode only)* — calls `SearchService.sync(notes)`.
   Errors are caught and logged as warnings so a Meilisearch outage does not
   break note saves.

Returns the complete `KnowledgeState`.

---

## KnowledgeController

```
GET /api/knowledge → KnowledgeService.rebuildIndexes()
```

Called on every frontend page load to hydrate the full application state. The
rebuild is idempotent: it only writes files when something has changed.

---

## Module wiring note

`SearchController` (`GET /api/search`) is declared in `KnowledgeModule`, **not**
in `SearchModule`. This is deliberate: if `SearchController` were in `SearchModule`,
NestJS would need `SearchModule → KnowledgeModule → SearchModule`, which is a
circular dependency. Declaring it in `KnowledgeModule` keeps the graph acyclic.

---

## Module imports

`KnowledgeModule` imports:
- `NotesFileModule` — provides `NoteFileRepository`
- `FlashcardsModule` — provides `FlashcardsService`
- `SearchModule` — provides `SearchService`
