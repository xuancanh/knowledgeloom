# Codex Module — Spec

**Location**: `server/src/codex/`  
**NestJS modules**: `CodexModule`, `CodexRunnerModule`

---

## Purpose

Provides AI-assisted note creation and in-editor note editing. The module is
split into two sub-modules to break the circular dependency chain:

```
FlashcardsModule → CodexRunnerModule   (runner only, no KnowledgeModule)
CodexModule → AiModule, NotesFileModule, KnowledgeModule
```

---

## CodexRunnerModule / CodexRunnerService

Low-level CLI runner. Spawns `codex exec` as a child process and captures its
output via a temp file.

**Why a temp file instead of stdout?**  
`codex exec` supports `--output-last-message <path>` which writes only the
final model response to disk, avoiding any interleaved tool-call output on
stdout.

**`run(prompt, outputExtension = 'md'): Promise<string>`**

1. Generates a unique temp path under `knowledge/` (hidden file, `.codex-output-…`).
2. Spawns: `codex exec --skip-git-repo-check --cd <rootDir> --output-last-message <path> <prompt>`
3. Enforces a timeout (`CODEX_TIMEOUT_MS`, default 180 s); kills the process on expiry.
4. Reads the temp file, deletes it, and resolves with the trimmed content.
5. Rejects on non-zero exit code, empty output, or timeout.

**Configuration**
| Env var | Default | Description |
|---------|---------|-------------|
| `CODEX_COMMAND` | `codex` | Path/name of the Codex CLI binary |
| `CODEX_TIMEOUT_MS` | `180000` | Per-run timeout in milliseconds |

---

## CodexModule / CodexService

Higher-level service. Injects `AiProvider` (not `CodexRunnerService` directly)
so the AI backend is swappable.

### `createNote(payload): Promise<any>`

Called by `JobsService` when processing a queued job. Selects a prompt builder
based on `payload.mode`:

| mode | Prompt builder | What it does |
|------|---------------|-------------|
| `research` | `buildResearchPrompt` | AI researches the topic from scratch |
| `link` | `buildLinkPrompt` | AI retrieves the URL and extracts content |
| `polish` | `buildPolishPrompt` | AI rewrites the user draft without adding facts |

Flow:
1. Reads all existing notes to supply as context for link generation.
2. Generates a collision-free slug via `uniqueNoteSlug`.
3. Calls `ai.complete(prompt)` → raw markdown.
4. Attaches provenance front-matter (`sourceUrl`, `originalRequest`).
5. Writes the file to `notesDir/<slug>.md` (flat; `KnowledgeService` migrates
   it to the correct category subfolder on the next rebuild).
6. Calls `knowledgeService.rebuildIndexes()` and returns the rebuilt state.

### `assistEdit(id, draft, instruction): Promise<any>`

Generates an edit proposal **without writing to disk**. The controller sends the
proposal back to the client for review; the user saves through `PUT /api/notes/:id`.

Flow:
1. Reads the current saved markdown.
2. Builds a prompt that includes the current note metadata, the editable draft,
   and the user instruction.
3. Calls `ai.complete(prompt)` → expects raw JSON (no fence).
4. Parses and normalises the JSON; filters `links` to only existing note ids.
5. Returns `{ update, codexStatus: 'completed' }`.

### Prompt conventions

All research and link prompts include the 20 most recent notes (as `id: title
(category) - summary` lines) so Codex can suggest relevant `links` values.

The edit-assist prompt includes up to 40 notes and returns a strict JSON shape:
```json
{ "title", "category", "summary", "tags", "links", "body" }
```

---

## Module imports

`CodexModule` imports:
- `AiModule` — provides `AI_PROVIDER`
- `NotesFileModule` — provides `NoteFileRepository`
- `KnowledgeModule` — provides `KnowledgeService`

`CodexRunnerModule` imports nothing and exports only `CodexRunnerService`.
