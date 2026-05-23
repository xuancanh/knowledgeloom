import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { notesDir } from './config.mjs';
import { runCodex } from './codex-runner.mjs';
import { loadNotes, parseNote, readNoteMarkdown, rebuildIndexes, stripFrontmatter, uniqueNoteSlug } from './notes.mjs';

/**
 * Creates the prompt contract for Codex-generated notes.
 *
 * The prompt includes recent note ids so Codex can create links that resolve
 * to existing markdown files. The expected frontmatter schema matches the note
 * parser in `notes.mjs`.
 */
function buildResearchPrompt(topic, context, existingNotes) {
  const related = existingNotes
    .slice(-20)
    .map((note) => `- ${note.id}: ${note.title} (${note.category}) - ${note.summary}`)
    .join('\n');

  return `Research this newly learned topic and produce one markdown knowledge note.

Topic: ${topic}
Learner context: ${context || 'No extra context provided.'}

Existing notes that can be linked by id:
${related || '- None yet'}

Return only markdown. Use this exact frontmatter schema. For category, use a slash-separated folder path when helpful, such as "Software Architecture/Domain Modeling" or "Product Management/Discovery".
---
title: "Clear note title"
category: "Folder/Subfolder"
summary: "One sentence summary"
tags: ["tag-one", "tag-two"]
links: ["existing-note-id"]
createdAt: "${new Date().toISOString()}"
---

# Clear note title

## What I learned
Explain the idea in practical terms.

## Why it matters
Explain when to use it and what tradeoffs matter.

## Key details
- Use compact bullets.

## Related knowledge
- Link to relevant existing note ids using [[note-id]] syntax when useful.
`;
}

/**
 * Creates the prompt contract for link-generated notes.
 *
 * Codex owns retrieval because it can decide how to inspect the page, extract
 * the main content, and ignore navigation or marketing chrome before writing a
 * normalized note into the same markdown schema as other creation modes.
 */
function buildLinkPrompt(payload, existingNotes) {
  const related = existingNotes
    .slice(-20)
    .map((note) => `- ${note.id}: ${note.title} (${note.category}) - ${note.summary}`)
    .join('\n');

  return `Retrieve this URL, read the main content, and produce one markdown knowledge note from it.

URL: ${payload.url}
Optional title hint: ${payload.topic || 'Use the source title.'}
Learner context: ${payload.context || 'No extra context provided.'}

Rules:
- Retrieve the linked source before writing.
- Summarize the durable ideas, not site navigation, ads, comments, or boilerplate.
- Preserve the source's meaning. Do not add unrelated research unless needed to explain a term briefly.
- If the source cannot be retrieved, return a short note explaining what failed and what can be inferred only from the URL/title.
- Include the source URL in the markdown body.

Existing notes that can be linked by id:
${related || '- None yet'}

Return only markdown. Use this exact frontmatter schema. For category, use a slash-separated folder path when helpful, such as "Engineering Management/Team Economics" or "Product Management/Research".
---
title: "Clear note title"
category: "Folder/Subfolder"
summary: "One sentence summary"
tags: ["tag-one", "tag-two"]
links: ["existing-note-id"]
createdAt: "${new Date().toISOString()}"
---

# Clear note title

## Source
- ${payload.url}

## What I learned
Explain the source's main idea in practical terms.

## Why it matters
Explain where this is useful and what tradeoffs or implications matter.

## Key details
- Use compact bullets grounded in the source.

## Related knowledge
- Link to relevant existing note ids using [[note-id]] syntax when useful.
`;
}

/**
 * Creates the prompt contract for the polishing mode.
 *
 * This mode is intentionally narrower than research. The user's draft is the
 * factual source of truth; Codex may improve structure, wording, and metadata,
 * but the prompt forbids adding new claims that are not already present.
 */
function buildPolishPrompt(payload, existingNotes) {
  const related = existingNotes
    .slice(-20)
    .map((note) => `- ${note.id}: ${note.title} (${note.category}) - ${note.summary}`)
    .join('\n');

  return `Polish this user-authored markdown note. Do not research. Do not add facts, claims, tools, examples, links, or citations that are not supported by the draft.

Title: ${payload.topic}
Category hint: ${payload.category || 'No category hint.'}
Summary hint: ${payload.summary || 'No summary hint.'}
Tags hint: ${(payload.tags || []).join(', ') || 'No tag hint.'}
Link hints: ${(payload.links || []).join(', ') || 'No link hint.'}
Polish instructions: ${payload.context || 'Improve clarity, organization, and readability while preserving meaning.'}

Existing notes that can be linked by id if the draft clearly supports the relationship:
${related || '- None yet'}

Draft:
${payload.body}

Return only markdown. Use this exact frontmatter schema. Preserve the user's category hint if supplied; slash-separated folder paths are supported.
---
title: "Clear note title"
category: "Folder/Subfolder"
summary: "One sentence summary based only on the draft"
tags: ["tag-one", "tag-two"]
links: ["existing-note-id"]
createdAt: "${new Date().toISOString()}"
---

# Clear note title

Keep the polished body faithful to the draft. Preserve important details and remove only repetition or unclear phrasing.
`;
}

/**
 * Creates the prompt contract for the inline editor assistant.
 *
 * Unlike creation prompts, this prompt returns a structured draft instead of
 * markdown. The UI applies the result to editable fields only; the user still
 * reviews and saves through the normal note update path.
 */
function buildEditAssistPrompt({ current, draft, instruction, existingNotes }) {
  const related = existingNotes
    .filter((note) => note.id !== current.id)
    .slice(-40)
    .map((note) => `- ${note.id}: ${note.title} (${note.category}) - ${note.summary}`)
    .join('\n');

  return `Revise this knowledge note draft according to the user's instruction.

Rules:
- Return only valid JSON. No markdown fence and no commentary.
- Preserve the user's intent and important details unless the instruction explicitly asks to remove them.
- Do not invent new facts. You may improve clarity, structure, title, summary, tags, category, and supported note links.
- The body must be markdown without YAML frontmatter.
- Links must be existing note ids only.

User instruction:
${instruction}

Existing note ids that may be linked if relevant:
${related || '- None'}

Current saved note metadata:
${JSON.stringify(current, null, 2)}

Editable draft:
${JSON.stringify(draft, null, 2)}

Return this exact JSON shape:
{
  "title": "string",
  "category": "string",
  "summary": "string",
  "tags": ["string"],
  "links": ["existing-note-id"],
  "body": "markdown body without frontmatter"
}
`;
}

/**
 * Extracts JSON from Codex output and validates the fields the editor needs.
 *
 * Codex is prompted to return raw JSON, but this defensive parsing tolerates a
 * fenced response or a short wrapper if the model deviates. The route returns a
 * clear error instead of applying a malformed edit proposal.
 */
function parseEditAssistJson(output) {
  const trimmed = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Codex did not return a JSON edit proposal');
  const parsed = JSON.parse(trimmed.slice(start, end + 1));
  const title = String(parsed.title || '').trim();
  const body = String(parsed.body || '').trim();
  if (!title || !body) throw new Error('Codex edit proposal is missing title or body');
  return {
    title,
    category: String(parsed.category || 'Uncategorized').trim() || 'Uncategorized',
    summary: String(parsed.summary || '').trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    links: Array.isArray(parsed.links) ? parsed.links.map((link) => String(link).trim()).filter(Boolean) : [],
    body,
  };
}

/**
 * Adds app-owned provenance fields to Codex markdown without asking Codex to
 * manage those fields. This guarantees source/request metadata survives even
 * when the generated body or frontmatter varies slightly from the prompt.
 */
function attachProvenance(markdown, { sourceUrl, originalRequest }) {
  const lines = [];
  if (sourceUrl) lines.push(`sourceUrl: "${String(sourceUrl).replace(/\n/g, ' ').replace(/"/g, '\\"')}"`);
  if (originalRequest) lines.push(`originalRequest: "${String(originalRequest).replace(/\n/g, ' ').replace(/"/g, '\\"')}"`);
  if (!lines.length) return markdown;

  if (/^---\n[\s\S]*?\n---/.test(markdown)) {
    return markdown.replace(/^---\n([\s\S]*?)\n---/, (_match, frontmatter) => {
      const filtered = frontmatter
        .split('\n')
        .filter((line) => !/^(sourceUrl|originalRequest):/.test(line))
        .join('\n');
      return `---\n${filtered}\n${lines.join('\n')}\n---`;
    });
  }

  return `---\n${lines.join('\n')}\n---\n\n${markdown}`;
}

/**
 * Builds the stable original request text stored with generated notes.
 */
function originalRequestFor(payload, mode, topic) {
  if (mode === 'link') {
    return [topic && topic !== payload.url ? `Title hint: ${topic}` : '', `URL: ${payload.url}`, payload.context ? `Context: ${payload.context}` : '']
      .filter(Boolean)
      .join(' | ');
  }
  if (mode === 'research') {
    return [topic, payload.context ? `Context: ${payload.context}` : ''].filter(Boolean).join(' | ');
  }
  return '';
}

/**
 * Generates and persists one AI-assisted markdown note for a completed job.
 *
 * The durable queue passes the whole creation payload in so this function can
 * honor the selected AI behavior. Research/link modes can inspect outside
 * sources; polish mode is constrained to the supplied draft and should not
 * introduce unsupported information.
 */
export async function createKnowledgeNote(payload) {
  const mode = payload.mode === 'polish' ? 'polish' : payload.mode === 'link' ? 'link' : 'research';
  const topic = String(payload.topic || payload.title || '').trim();
  const existingNotes = await loadNotes();
  const slug = uniqueNoteSlug(topic || payload.url || 'linked-source');
  const notePath = path.join(notesDir, `${slug}.md`);
  const prompt = mode === 'polish'
    ? buildPolishPrompt({ ...payload, topic }, existingNotes)
    : mode === 'link'
      ? buildLinkPrompt({ ...payload, topic }, existingNotes)
      : buildResearchPrompt(topic, payload.context || '', existingNotes);
  const output = await runCodex(prompt);
  const markdown = attachProvenance(output, {
    sourceUrl: mode === 'link' ? payload.url : '',
    originalRequest: originalRequestFor(payload, mode, topic),
  });

  await writeFile(notePath, markdown.endsWith('\n') ? markdown : `${markdown}\n`);
  const state = await rebuildIndexes();
  const note = state.notes.find((item) => item.id === slug);
  return { note, state, codexStatus: 'completed' };
}

/**
 * Generates an AI edit proposal for an existing note without writing it.
 *
 * The editor sends its current unsaved draft, so the assistant can build on
 * manual edits already made in the form. Persistence stays separate: the UI
 * applies this proposal locally and the normal save route remains the single
 * write path for edited notes.
 */
export async function assistNoteEdit(id, draft, instruction) {
  const safeId = path.basename(id);
  const currentMarkdown = await readNoteMarkdown(safeId);
  const current = parseNote(`${safeId}.md`, currentMarkdown);
  const existingNotes = await loadNotes();
  const prompt = buildEditAssistPrompt({
    current,
    draft: {
      title: draft.title || current.title,
      category: draft.category || current.category,
      summary: draft.summary || current.summary,
      tags: Array.isArray(draft.tags) ? draft.tags : current.tags,
      links: Array.isArray(draft.links) ? draft.links : current.links,
      body: draft.body || stripFrontmatter(currentMarkdown),
    },
    instruction,
    existingNotes,
  });
  const output = await runCodex(prompt);
  const update = parseEditAssistJson(output);
  const existingIds = new Set(existingNotes.map((note) => note.id));
  return {
    update: {
      ...update,
      links: update.links.filter((link) => existingIds.has(link)),
    },
    codexStatus: 'completed',
  };
}
