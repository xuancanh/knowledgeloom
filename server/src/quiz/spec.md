# Quiz Module — Spec

**Location**: `server/src/quiz/`
**NestJS module**: `QuizModule`

---

## Purpose

Generates AI-authored quiz questions from saved notes, caches them by note hash,
and tracks spaced-repetition reviews. Questions are of three types: fill-in-the-blank,
multiple-choice, and short-answer.

---

## QuizService

### `sync(userId, noteSources, opts) → QuizQuestion[]`

Called by `KnowledgeService` during index rebuild. The service:

1. **Loads cache** from `QuizCacheRepository` for the given user.
2. **Disabled mode**: if `AI_FLASHCARDS_DISABLED=1` or `aiEnabled = false`,
   returns cached questions for notes that still exist (skips AI calls).
3. **Hash check**: for each note, computes a SHA-256 hash of
   `{ markdown, category, tags, title, summary }`. If the hash matches the cache
   and `force` is false, reuses the cached questions.
4. **AI generation**: uncached notes are processed in **batches of 3** (parallel
   AI calls within each batch, serial between batches). Each batch sends the
   note metadata + markdown to the AI provider and requests JSON output.
5. **Normalization**: validates and filters the raw AI output (see below).
6. **Cache replacement**: writes the updated cache via `QuizCacheRepository.replace()`.
7. Returns the full question set.

### `computeReview(rating, currentStreak) → { nextReviewAt, streak }`

Simple streak-based spaced-repetition schedule:

| Scenario | Days until next review | New streak |
|----------|----------------------|------------|
| `wrong` | 1 day | 0 |
| `correct` with streak 0 | 3 days | 1 |
| `correct` with streak 1 | 7 days | 2 |
| `correct` with streak 2+ | 14 days | currentStreak + 1 |

This is intentionally simpler than SM-2 to keep the codebase small.

### `loadEnrichedData(userId, noteSources) → { allQuestions, reviews }`

Convenience method called by `KnowledgeService`. Runs `sync()`, filters out
hidden questions, loads reviews, and returns both datasets for the frontend.

### Normalization rules (`normalize`)

- `type` must be one of `fill-blank`, `multiple-choice`, `short-answer`.
- `question` and `answer` must be non-empty strings.
- **fill-blank**: `question` must contain `___` (three underscores).
- **multiple-choice**: must have ≥ 2 choices, and `correctIndex` must be a valid
  index into the choices array.
- **short-answer**: `answer` must be ≥ 20 characters.
- Each generated question gets a deterministic id: `quiz-<noteId>-<uuid>`.
- Capped at `SIZE_RANGE[size].cap` (10/20/40 for small/medium/large).

### Prompt format (`buildPrompt`)

The AI receives note metadata as JSON and the full markdown body. The system
prompt requests a `{ questions: [...] }` JSON object with no code fence.
Size ranges: small (5-10), medium (10-20), large (20-40).

---

## QuizCacheRepository

Drizzle access for the `quiz_cache` table.

- **`load(userId)`** — loads all cache entries for the user, parses `questions` JSON.
- **`replace(userId, nextNotes)`** — deletes all rows for the user, re-inserts
  updated entries. Runs in a transaction for PostgreSQL; separate SQLite path.
  Returns early in read-only mode.

---

## QuizReviewsRepository

Drizzle access for the `quiz_reviews` table.

- **`loadAll(userId)`** — returns a `Map<questionId, QuizReview>`.
- **`upsert(userId, review)`** — inserts or updates a review record (uses
  `onConflictDoUpdate` targeting `questionId`).
- **`delete(userId, questionId)`** — removes a review record.

---

## QuizHiddenRepository

Drizzle access for the `quiz_hidden` table.

- **`loadAll(userId)`** — returns a `Set<questionId>` of hidden questions.
- **`hide(userId, questionId)`** — inserts a hidden record (uses
  `onConflictDoNothing` — idempotent).
- **`restore(userId, questionId)`** — removes the hidden record.

---

## QuizController

```
POST   /api/quiz/:id/review   → { review }       @UseGuards(ApiAuthGuard)
DELETE /api/quiz/:id          → 204               @UseGuards(ApiAuthGuard)
POST   /api/quiz/:id/restore  → { restored: id }  @UseGuards(ApiAuthGuard)
```

### Review (`POST /api/quiz/:id/review`)

Computes the next review date via `computeReview()` and persists the result
via `reviewsRepo.upsert()`. Request body: `{ rating, noteId, currentStreak? }`.

### Remove (`DELETE /api/quiz/:id`)

Hides the question and deletes its review record. Returns HTTP 204.

### Restore (`POST /api/quiz/:id/restore`)

Removes the hidden flag so the question reappears in study sessions.

---

## Module wiring

`QuizModule` imports `AiModule` (provides `AI_PROVIDER`). It declares
`QuizController` and provides `QuizService` + three repositories.
`QuizService` is exported so `KnowledgeModule` can import it.

---

## BDD Spec

### Feature: Quiz generation

**Scenario: Cache hit — unchanged note**
- GIVEN a note has cached quiz questions with a matching hash
- WHEN `sync()` runs for that note
- THEN the cached questions are returned
- AND no AI call is made

**Scenario: Cache miss — new or changed note**
- GIVEN a note has no cached questions OR the hash has changed
- WHEN `sync()` runs for that note
- THEN the AI provider is called with a prompt containing the note metadata + markdown
- AND the returned JSON is parsed and normalized
- AND questions are saved to the cache

**Scenario: AI generation failure falls back to cache**
- GIVEN a note with cached questions AND a changed hash
- WHEN `sync()` runs and the AI call fails
- THEN the old cached questions are preserved for that note

**Scenario: AI flashcard generation disabled**
- GIVEN `AI_FLASHCARDS_DISABLED=1`
- WHEN `sync()` runs
- THEN only cached questions for existing notes are returned
- AND no AI calls are made

**Scenario: Fill-blank question normalization**
- GIVEN an AI-generated question with `type: "fill-blank"`
- WHEN the `question` field does not contain `___`
- THEN the question is rejected

**Scenario: Multiple-choice question with too few choices**
- GIVEN an AI-generated question with `type: "multiple-choice"` and only 1 choice
- THEN the question is rejected

**Scenario: Short-answer question with too-short answer**
- GIVEN an AI-generated question with `type: "short-answer"` and `answer` length < 20
- THEN the question is rejected

**Scenario: Unknown question type**
- GIVEN an AI-generated question with `type: "essay"` (not in the valid set)
- THEN the question is rejected

**Scenario: Size cap**
- GIVEN `size: "small"` (cap 10) and the AI returns 15 valid questions
- THEN only the first 10 are kept

### Feature: Spaced repetition review

**Scenario: Answer correctly with no prior streak**
- GIVEN `rating: "correct"` and `currentStreak: 0`
- WHEN `computeReview()` is called
- THEN `streak` is 1 and `nextReviewAt` is 3 days from now

**Scenario: Answer correctly with existing streak**
- GIVEN `rating: "correct"` and `currentStreak: 1`
- WHEN `computeReview()` is called
- THEN `streak` is 2 and `nextReviewAt` is 7 days from now

**Scenario: Answer correctly with streak ≥ 2**
- GIVEN `rating: "correct"` and `currentStreak: 5`
- WHEN `computeReview()` is called
- THEN `streak` is 6 and `nextReviewAt` is 14 days from now

**Scenario: Answer incorrectly resets streak**
- GIVEN `rating: "wrong"` and `currentStreak: 5`
- WHEN `computeReview()` is called
- THEN `streak` is 0 and `nextReviewAt` is 1 day from now

### Feature: Quiz review persistence

**Scenario: Record a review**
- GIVEN an authenticated user reviews question `q1`
- WHEN they POST to `/api/quiz/q1/review` with `{ rating: "correct", noteId: "n1", currentStreak: 2 }`
- THEN the review is persisted with the computed `nextReviewAt` and `streak`
- AND the response is `{ review: { nextReviewAt, streak } }`

**Scenario: Hide a question**
- GIVEN an authenticated user
- WHEN they DELETE `/api/quiz/q1`
- THEN the question is added to the hidden set
- AND its review record is deleted
- AND the response is HTTP 204

**Scenario: Restore a hidden question**
- GIVEN question `q1` was previously hidden
- WHEN the user POSTs to `/api/quiz/q1/restore`
- THEN the question is removed from the hidden set
- AND the response is `{ restored: "q1" }`
