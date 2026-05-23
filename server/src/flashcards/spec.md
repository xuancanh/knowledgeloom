# Flashcards Module — Spec

**Location**: `server/src/flashcards/`  
**NestJS module**: `FlashcardsModule`

---

## Purpose

Generates and caches AI flashcards for each note. Flashcards are derived
artifacts: they are created automatically during `KnowledgeService.rebuildIndexes()`
and cached in SQLite to avoid calling the AI on every rebuild.

---

## FlashcardsService

### `sync(noteSources, { force = false }): Promise<Flashcard[]>`

Called by `KnowledgeService` after reading all note sources.

For each note:
1. Computes a SHA-256 hash over `{ markdown, category, tags, title, summary }`.
2. If the hash matches the cached entry and `force` is false → reuses cached cards.
3. Otherwise calls `ai.complete(prompt, { outputFormat: 'json' })` and parses the result.
4. Normalises, filters, and caps the cards (max 8 per note).
5. Writes the updated cache back to SQLite via `FlashcardCacheRepository`.

When `AI_FLASHCARDS_DISABLED=1` the sync is a read-only pass: it returns the
cached cards for notes that still exist and skips AI calls entirely.

### Normalisation rules

- `prompt` must be ≥ 8 characters.
- `lesson` must be ≥ 30 characters.
- Generic prompts are rejected: "what i learned", "key details", "lesson",
  "summary", "key idea".
- `kind` must be one of `concept | question | lesson | tradeoff | pattern`;
  anything else is coerced to `lesson`.
- At most 8 cards per note (first 8 after filtering).

### Prompt format

The AI receives note metadata as JSON and the full markdown body. The system
prompt requests a `{ flashcards: [...] }` JSON object with no code fence.

---

## FlashcardCacheRepository

Reads and writes the `flashcard_cache` table via Drizzle.

**`load(): Record<noteId, { hash, cards, generatedAt }>`** — loads the full cache as an in-memory map.

**`replace(data): void`** — replaces all rows in a single transaction. Called at the end of every sync.

---

## Module imports

`FlashcardsModule` imports `AiModule` (provides `AI_PROVIDER`). It does **not**
import `CodexModule` to avoid a circular dependency
(`FlashcardsModule → CodexModule → KnowledgeModule → FlashcardsModule`).

---

## Adding a new flashcard kind

1. Add the new `kind` value to the `Flashcard` type in `server/src/types.ts`
   and `src/types.ts`.
2. Add the allowed value to `allowedKinds` in `FlashcardsService`.
3. Add a label and color to `KIND_LABEL` / `KIND_COLOR` in `FlashcardsPage.tsx`.
