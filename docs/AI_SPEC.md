# AI Specification

This document is the contract for AI-assisted behavior in Knowledge Loom. Update it when changing prompts, generated schemas, or queue behavior.

## Principles

- Markdown notes are canonical content.
- SQLite stores durable operational state for queued AI work and cached generated study material.
- Meilisearch is a searchable projection, not a source of truth.
- Codex may write notes only through queued creation flows. Inline edit assistance returns a proposal that the user reviews before saving.
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

## Flashcard Generation

Flashcards are AI-authored study cards generated from saved notes. They are cached in SQLite by note hash.

Set `AI_FLASHCARDS_DISABLED=1` for smoke tests or constrained deployments that need note/search rebuilds without invoking Codex for uncached cards.

Allowed `kind` values:

- `concept`: defines what something is
- `question`: tests recall or reasoning
- `lesson`: captures a practical takeaway
- `tradeoff`: explains a decision tension, caveat, or risk
- `pattern`: captures a reusable approach or technique

Codex must return only JSON:

```json
{
  "flashcards": [
    {
      "prompt": "Specific card title",
      "lesson": "Micro lesson grounded in the note.",
      "kind": "concept"
    }
  ]
}
```

Card prompts must not be generic headings such as "What I learned", "Lesson", or "Summary".

## Queue Behavior

AI creation jobs are durable SQLite rows. A queued job may become `running`, `done`, or `error`.

- Only one Codex job runs at a time.
- Failed jobs retry until `CODEX_JOB_MAX_ATTEMPTS`.
- Interrupted `running` jobs are reset to `queued` on boot.
- Completed direct-write jobs are recorded as activity entries even though they do not run Codex.

## Verification

AI-related changes should run:

```bash
npm run test
npm run smoke:meili
npm run lint
npm run build
```

For prompt changes, also inspect at least one generated note or flashcard payload to confirm the schema and UX-level text quality are still correct.
