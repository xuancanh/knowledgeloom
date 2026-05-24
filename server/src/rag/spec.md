# RAG Module — Spec

**Location**: `server/src/rag/`
**NestJS module**: `RagModule`

---

## Purpose

Provides streaming retrieval-augmented generation (RAG) over the knowledge base.
Users ask free-text questions scoped to a note, a category, a tag, or the whole
vault. The service retrieves relevant content, assembles a context block, and
streams AI tokens back in real time.

---

## Endpoint

```
POST /api/rag/stream   @UseGuards(WritableGuard)
```

Request body:
```typescript
{
  question: string;
  scope: RagScope;         // { type: 'all' } | { type: 'note'; id: string } | { type: 'category'; path: string } | { type: 'tag'; tag: string }
  history: ChatMessage[];  // { role: 'user' | 'assistant'; content: string }[]
}
```

Response: `text/plain; charset=utf-8` chunked stream of AI tokens. Uses HTTP
streaming (NOT WebSocket):
- `Content-Type: text/plain; charset=utf-8`
- `Cache-Control: no-cache`
- `X-Accel-Buffering: no` (disables nginx proxy buffering)
- `Transfer-Encoding: chunked`
- `res.flushHeaders()` before the first token

Errors mid-stream are written as `\n\n[Error: ...]` and the response is ended.

---

## RagService

### `stream(req: RagRequest): AsyncGenerator<string>`

Main pipeline:

1. **Retrieve** — `retrieveNotes(scope)` returns relevant `KnowledgeNote[]`:
   - `note` scope: looks up the single note by id, returns its markdown body.
   - `category` scope: filters all notes by category prefix; keyword-ranks by `question`.
   - `tag` scope: filters all notes with that tag; keyword-ranks by `question`.
   - `all` scope: calls `SearchService.search(question)` for semantic relevance;
     falls back to keyword ranking over all notes if search returns nothing.

2. **Assemble** — `buildContextBlock(notes, question)` serialises up to 12 notes,
   up to 16 000 chars total. Each note block:
   ```
   ## Note Title
   Category: ...  Tags: ...
   <markdown body>
   ```
   Truncates at 16 000 chars with `[…truncated]`.

3. **Prompt** — `buildMessages(context, history, question)` returns `AiMessage[]`:
   - System message: instructs the AI to answer only from the provided notes,
     cite note titles, admit when a question cannot be answered from the context.
   - History messages: prior `user` / `assistant` turns.
   - Final user message: `question`.

4. **Stream** — calls `ai.completeStream(messages)` and yields each token to the
   caller (`RagController` writes tokens to `res`).

### `rankByRelevance(notes, question): KnowledgeNote[]`

Keyword-based fallback scoring used when search is unavailable or returns no
hits. Scores each note by how many question words appear in title + summary +
tags (case-insensitive). Returns notes sorted descending by score, then
alphabetically.

---

## Module wiring

`RagModule` imports:
- `AiModule` — injects `AI_PROVIDER`
- `SearchModule` — injects `SEARCH_PROVIDER`
- `NotesFileModule` — injects `NoteFileRepository` (reads note markdown bodies)

`RagModule` declares `RagController` and provides `RagService`.

---

## Frontend consumption

The frontend calls `POST /api/rag/stream` via the `streamRagAnswer()` function
in `src/api.ts` (returns `AsyncGenerator<string>`). `useRagChat` hook manages
the message array and streaming state. `ChatPanel` component renders the chat UI.

Chat history is persisted to `localStorage` under key `kl:chat-history` (max
200 messages, streaming flag stripped before save).

---

## Scope detection (frontend)

`ChatPanel` auto-detects scope from the current URL:
- `/notes/:id` → `{ type: 'note', id }`
- `/tags/:tag` → `{ type: 'tag', tag }`
- `/categories/*` → `{ type: 'category', path }`
- anything else → `{ type: 'all' }`

The user can override the detected scope via chips in the panel header.
