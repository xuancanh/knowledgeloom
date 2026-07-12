# AI Specification

This document is the contract for AI-assisted behavior in Knowledge Loom. Update it when changing prompts, generated schemas, or queue behavior.

## Principles

- Markdown notes are canonical content.
- SQLite stores durable operational state for queued AI work and cached generated study material.
- Meilisearch is a searchable projection, not a source of truth.
- Codex may write notes only through queued creation flows. Inline edit assistance and draft capture assistance return proposals that the user reviews before saving.
- AI output must be constrained to explicit JSON or markdown schemas so service code can validate it.

## Creation Modes

### Write Note

`mode: "write"` is not AI-assisted. The backend validates `title` and `body`, writes markdown with canonical frontmatter, rebuilds derived indexes, and records a completed activity job in SQLite.

### Polish Draft

`mode: "polish"` queues Codex with the user's draft as the only factual source.

Codex may:
- improve title, summary, tags, category, and structure
- remove repetition and clarify wording
- add links only when supported by the draft and existing note list

Codex must not:
- research outside sources
- add unsupported facts, examples, tools, citations, or claims
- bypass the markdown frontmatter schema

### Research And Write

`mode: "research"` queues Codex with a topic and optional learner context. Codex may research the topic and create one durable note using the canonical frontmatter schema.

### Generate From Link

`mode: "link"` queues Codex with a URL. Codex retrieves the source, extracts durable ideas, ignores boilerplate, preserves the URL as provenance, and writes one note. If retrieval fails, the note must clearly say what failed instead of pretending the source was read.

## Note Markdown Schema

AI-created notes must return only markdown with this frontmatter shape:

```markdown
---
title: "Clear note title"
category: "Folder/Subfolder"
summary: "One sentence summary"
tags: ["tag-one", "tag-two"]
links: ["existing-note-id"]
createdAt: "ISO timestamp"
---

# Clear note title

## What I learned
...
```

Categories may use slash-separated folders. Links must be existing note ids.

## Inline Edit Assist

Endpoint: `POST /api/notes/:id/assist`

The user supplies the current unsaved editor draft and an instruction. Codex returns a JSON proposal only:

```json
{
  "title": "string",
  "category": "string",
  "summary": "string",
  "tags": ["string"],
  "links": ["existing-note-id"],
  "body": "markdown body without frontmatter"
}
```

The frontend applies this proposal to the edit form. The backend must not save the proposal until the user calls the normal note update route.

## Draft Capture Assist

Endpoint: `POST /api/notes/assist-draft`

Same response shape as the inline edit assist (`{ update: NoteUpdate, codexStatus: string }`), but operates on unsaved drafts — no note ID is required. The frontend calls this from `CaptureBox` before the note has been created. The prompt is built by `CodexService.buildDraftAssistPrompt()` and does not include a "current saved note" comparison. The user reviews the proposed changes in the capture form and saves normally.

## RAG Streaming

Endpoint: `POST /api/rag/stream`  
Request: `{ question: string, scope: RagScope, history: ChatMessage[] }`  
Response: `text/plain` chunked stream of AI tokens (HTTP streaming, NOT WebSocket)

Pipeline:

1. Retrieve notes by scope: `note` → full markdown body of one note; `category`/`tag` → filter all notes and keyword-rank; `all` → semantic search via `SearchService` with keyword fallback.
2. Assemble context block: up to 12 notes, 16 000 chars total, truncated with `[…truncated]`.
3. Build messages array: system prompt containing the context block, conversation history, then the user question.
4. Stream tokens via `AiProvider.completeStream(messages)` → `AsyncGenerator<string>`.
5. Write each token to the HTTP response via `res.write(token)`.

The AI provider interface requires both `complete()` and `completeStream()`:

```typescript
interface AiProvider {
  complete(prompt: string, opts?: AiCompletionOptions): Promise<string>;
  completeStream(messages: AiMessage[], opts?: AiCompletionOptions): AsyncGenerator<string>;
}
interface AiMessage { role: 'system' | 'user' | 'assistant'; content: string; }
```

`CodexAiProvider.completeStream()` is a fallback implementation: it calls `complete()` and yields the full response as one chunk (the Codex CLI does not support streaming). `OpenRouterAiProvider.completeStream()` uses the OpenAI SSE streaming protocol (`stream: true`), parses `data: {...}` lines, and extracts `choices[0].delta.content` from each event.

`complete()` is used by note creation (polish/research/link modes) and flashcard generation. `completeStream()` is used exclusively by the RAG pipeline.

## Flashcard Generation

Flashcards are AI-authored study cards generated from saved notes. They are cached in SQLite by note hash.

Set `AI_FLASHCARDS_DISABLED=1` for smoke tests or constrained deployments that need note/search rebuilds without invoking Codex for uncached cards.
Failed automatic flashcard or quiz generation keeps any prior material and is
cached with a retry marker, preventing every index rebuild from repeating the
same provider outage. `AI_GENERATION_RETRY_MS` controls the automatic retry
window (default 15 minutes); explicit regeneration always bypasses it.

### Kind values

| Kind | When to use |
|------|-------------|
| `concept` | what a term, mechanism, or principle IS and how it works |
| `question` | when/why/how: a judgment call or causal chain the reader must reason through |
| `lesson` | a specific insight the author captured from experience or reading |
| `tradeoff` | an explicit tension: X gains Y but costs Z (use only when the note directly compares two approaches) |
| `pattern` | a reusable structure or technique and the problem it solves (use only when a reusable structure is described) |

Default to `concept` or `lesson` when neither tradeoff nor pattern clearly fits.

### Prompt quality rules

- **Atomic**: one idea per card. Never combine two distinct facts.
- **prompt** field: 8–90 chars. Must be specific enough that the reader knows exactly what to recall.
- **lesson** field: 1–3 sentences, 30–400 chars. Must contain the actual fact — not a pointer to it.
- **Banned prompts** (exact or near-match): "Key takeaway", "What I learned", "Main concept", "Summary", "Lesson", "Key idea", "Key details", "Key insight", "Important note".
- Prioritise non-obvious distinctions, failure modes, counterintuitive results, and decision heuristics over obvious or trivially memorable facts.

### Prompt examples

Good prompts:
- "What makes consistent hashing resilient to adding/removing nodes?"
- "When does optimistic locking beat pessimistic locking?"
- "What does the saga pattern give up compared to two-phase commit?"

Bad prompts:
- "What I learned" — no retrieval cue
- "Key idea" — could be anything
- "Distributed systems" — a topic, not a question

### Output schema

Codex must return only JSON:

```json
{
  "flashcards": [
    {
      "prompt": "Specific retrieval question (8–90 chars)",
      "lesson": "Self-contained fact the prompt is testing (30–400 chars).",
      "kind": "concept"
    }
  ]
}
```

### Size variants

| Size | Cards |
|------|-------|
| `small` | 5–10 |
| `medium` | 10–20 |
| `large` | 20–40 |

The size is set per-regen call via the `regenSize` job field (see Queue Behavior below).

## Queue Behavior

AI creation jobs are durable SQLite rows. A queued job may become `running`, `done`, or `error`.

- Only one Codex job runs at a time.
- Failed jobs retry until `CODEX_JOB_MAX_ATTEMPTS`.
- Interrupted `running` jobs are reset to `queued` on boot.
- Completed direct-write jobs are recorded as activity entries even though they do not run Codex.

### Job modes

| `mode` | Description |
|--------|-------------|
| `research` | Codex researches topic and writes one note |
| `link` | Codex fetches a URL and converts it to a note |
| `polish` | Codex improves an existing draft; draft is the only factual source |
| `write` | Direct markdown write; no Codex, recorded as a completed activity entry |
| `regen` | Regenerate flashcards and/or quiz questions for an existing note |

### Regen-mode job fields

Regen jobs carry three extra fields in addition to the base `Job` shape:

| Field | Type | Description |
|-------|------|-------------|
| `noteId` | `string` | ID of the note to regenerate for |
| `regenTarget` | `'flashcards' \| 'quiz' \| 'all'` | Which study material to regenerate |
| `regenSize` | `'small' \| 'medium' \| 'large'` | Number of cards/questions to generate |

`JobsService.enqueue()` must explicitly copy these fields from the payload — they are not part of the common job shape and will be silently dropped if the field list is not maintained. `JobsProcessor` reads them to dispatch `KnowledgeService.regenerateForNote(userId, noteId, target, size)`.

## Verification

AI-related changes should run:

```bash
npm run test
npm run smoke:meili
npm run lint
npm run build
```

For prompt changes, also inspect at least one generated note or flashcard payload to confirm the schema and UX-level text quality are still correct.
