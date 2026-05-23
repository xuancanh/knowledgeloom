import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { runCodex } from './codex-runner.mjs';
import { AI_FLASHCARDS_DISABLED, flashcardsPath, READ_ONLY_MODE } from './config.mjs';
import {
  importLegacyFlashcardsIfEmpty,
  loadFlashcardCache,
  replaceFlashcardCache,
} from './repositories/flashcard-repository.mjs';

/**
 * Builds the Codex prompt for flashcard generation.
 *
 * Flashcards are intentionally AI-authored because they should be micro-lessons,
 * not mechanical excerpts. Codex must choose useful card titles and lessons from
 * the note while preserving the note's facts.
 */
function buildFlashcardPrompt(note, markdown) {
  return `Create high-signal flashcards from this knowledge note.

Rules:
- Return only valid JSON. No markdown fence and no commentary.
- Create 4 to 8 flashcards.
- Each flashcard must be a snippet or micro lesson from the note, not a generic section heading.
- The "prompt" must be specific to the card's idea. Never use generic titles like "What I learned", "Key details", "Lesson", or "Summary".
- The "lesson" should be 1 to 3 concise sentences, grounded only in the note.
- Prefer cards that help the user remember useful distinctions, tradeoffs, definitions, and practical implications.
- The "kind" must be exactly one of:
  - "concept": defines what something is.
  - "question": tests recall or reasoning.
  - "lesson": captures a practical takeaway.
  - "tradeoff": explains a decision tension, caveat, or risk.
  - "pattern": captures a reusable approach or technique.
- Use a mix of kinds when the note supports it.

Note metadata:
${JSON.stringify({
    id: note.id,
    title: note.title,
    category: note.category,
    tags: note.tags,
    summary: note.summary,
  }, null, 2)}

Markdown:
${markdown}

Return this exact JSON shape:
{
  "flashcards": [
    {
      "prompt": "Specific card title",
      "lesson": "Micro lesson grounded in the note.",
      "kind": "concept"
    }
  ]
}
`;
}

/**
 * Parses Codex JSON while tolerating accidental fences or prose around it.
 */
function parseFlashcardJson(output) {
  const trimmed = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('Codex did not return flashcard JSON');
  const parsed = JSON.parse(trimmed.slice(start, end + 1));
  if (!Array.isArray(parsed.flashcards)) throw new Error('Codex flashcard JSON is missing flashcards array');
  return parsed.flashcards;
}

/**
 * Normalizes AI-authored cards into the app's stable flashcard schema.
 */
function normalizeCards(note, rawCards) {
  const generic = new Set(['what i learned', 'key details', 'lesson', 'summary', 'key idea']);
  const allowedKinds = new Set(['concept', 'question', 'lesson', 'tradeoff', 'pattern']);
  return rawCards
    .map((card) => {
      const prompt = String(card.prompt || '').trim();
      const lesson = String(card.lesson || '').trim();
      const rawKind = String(card.kind || '').trim().toLowerCase();
      const kind = allowedKinds.has(rawKind) ? rawKind : 'lesson';
      return { prompt, lesson, kind };
    })
    .filter((card) => card.prompt.length >= 8 && card.lesson.length >= 30 && !generic.has(card.prompt.toLowerCase()))
    .slice(0, 8)
    .map((card) => ({
      id: `${note.id}-${randomUUID()}`,
      noteId: note.id,
      noteTitle: note.title,
      category: note.category,
      tags: note.tags,
      prompt: card.prompt,
      lesson: card.lesson,
      kind: card.kind,
    }));
}

/**
 * Hashes the full markdown plus metadata that affects flashcard filters.
 */
function noteHash(note, markdown) {
  return createHash('sha256')
    .update(JSON.stringify({ markdown, category: note.category, tags: note.tags, title: note.title, summary: note.summary }))
    .digest('hex');
}

/**
 * Loads the persisted AI flashcard cache from SQLite.
 */
async function loadCache() {
  if (READ_ONLY_MODE) {
    if (!existsSync(flashcardsPath)) return { notes: {} };
    return JSON.parse(await readFile(flashcardsPath, 'utf8'));
  }
  await importLegacyFlashcardsIfEmpty();
  return { notes: loadFlashcardCache() };
}

/**
 * Writes the persisted AI flashcard cache to SQLite.
 */
async function saveCache(cache) {
  replaceFlashcardCache(cache.notes || {});
}

/**
 * Generates or reuses AI-authored flashcards for every note.
 *
 * `force` is used by the regeneration script to discard old mechanical cards.
 * Normal index rebuilds use hashes so polling `/api/knowledge` does not invoke
 * Codex unless a note was actually created or changed.
 */
export async function syncFlashcards(noteSources, { force = false } = {}) {
  const cache = await loadCache();
  if (AI_FLASHCARDS_DISABLED) {
    const noteIds = new Set(noteSources.map(({ note }) => note.id));
    return Object.entries(cache.notes || {})
      .filter(([noteId]) => noteIds.has(noteId))
      .flatMap(([, entry]) => entry.cards || []);
  }
  const nextNotes = {};

  for (const { note, markdown } of noteSources) {
    const hash = noteHash(note, markdown);
    const cached = cache.notes?.[note.id];
    if (!force && cached?.hash === hash && Array.isArray(cached.cards)) {
      nextNotes[note.id] = cached;
      continue;
    }

    const output = await runCodex(buildFlashcardPrompt(note, markdown), { outputExtension: 'json' });
    const cards = normalizeCards(note, parseFlashcardJson(output));
    nextNotes[note.id] = { hash, cards, generatedAt: new Date().toISOString() };
  }

  const nextCache = { notes: nextNotes };
  await saveCache(nextCache);
  return Object.values(nextNotes).flatMap((entry) => entry.cards || []);
}
