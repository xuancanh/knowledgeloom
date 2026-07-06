/**
 * regenerate-flashcards.ts
 *
 * Standalone script that re-generates AI flashcards for every note, bypassing
 * the cache. Writes results directly to the SQLite `flashcard_cache` table.
 *
 * Usage:
 *   npx tsx scripts/regenerate-flashcards.ts
 *
 * The script respects the same AI_PROVIDER / AI_API_KEY / CODEX_COMMAND env
 * vars used by the server. It must NOT import any NestJS-decorated class
 * because tsx / esbuild does not support `experimentalDecorators`.
 */

import { readFile, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

// Safe imports — no NestJS decorators in these files.
import _getConfig from '../server/src/config/configuration.js';
import { parseNote } from '../server/src/common/note-parser.util.js';
import { sqliteFlashcardCache } from '../server/src/database/schema.js';
import type { KnowledgeNote, NoteSource, Flashcard } from '../server/src/types.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// ESM/CJS interop: tsx may wrap the default export in a { default: fn } object.
const getConfig: () => ReturnType<typeof _getConfig> =
  typeof _getConfig === 'function' ? (_getConfig as any) : (_getConfig as any).default;
const config = getConfig();

// ---------------------------------------------------------------------------
// Codex runner (inlined from server/src/codex/codex-runner.service.ts)
// ---------------------------------------------------------------------------

function runCodex(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputPath = join(
      config.knowledgeDir,
      `.codex-output-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
    );
    const child = spawn(
      config.codexCommand,
      ['exec', '--skip-git-repo-check', '--cd', config.rootDir, '--output-last-message', outputPath, prompt],
      { cwd: config.rootDir, stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
    );

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Codex timed out after ${config.codexTimeoutMs}ms`));
    }, config.codexTimeoutMs);

    child.stdout.on('data', (c: Buffer) => { stdout += c; });
    child.stderr.on('data', (c: Buffer) => { stderr += c; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        rm(outputPath, { force: true }).catch(() => {});
        reject(new Error(stderr || stdout || `exit ${code}`));
        return;
      }
      readFile(outputPath, 'utf8')
        .then((content) => {
          rm(outputPath, { force: true }).catch(() => {});
          if (content.trim()) resolve(content.trim());
          else reject(new Error('no output'));
        })
        .catch(reject);
    });
  });
}

// ---------------------------------------------------------------------------
// OpenRouter-compatible HTTP AI provider
// ---------------------------------------------------------------------------

async function runOpenRouter(prompt: string): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (config.aiSystemPrompt) {
    messages.push({ role: 'system', content: config.aiSystemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const response = await fetch(`${config.aiApiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.aiApiKey ? { Authorization: `Bearer ${config.aiApiKey}` } : {}),
      'HTTP-Referer': 'https://github.com/knowledge-loom',
      'X-Title': 'Knowledge Loom',
    },
    body: JSON.stringify({
      model: config.aiModel,
      messages,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API ${response.status}: ${text}`);
  }

  const data: any = await response.json();
  const content: string = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('AI API returned an empty response');
  return content.trim();
}

async function aiComplete(prompt: string): Promise<string> {
  if (config.aiProvider === 'codex') {
    return runCodex(prompt);
  }
  return runOpenRouter(prompt);
}

// ---------------------------------------------------------------------------
// Flashcard helpers (ported from FlashcardsService)
// ---------------------------------------------------------------------------

function noteHash(note: KnowledgeNote, markdown: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ markdown, category: note.category, tags: note.tags, title: note.title, summary: note.summary }))
    .digest('hex');
}

function buildPrompt(note: KnowledgeNote, markdown: string): string {
  return `Create high-signal flashcards from this knowledge note.

Rules:
- Return only valid JSON. No markdown fence and no commentary.
- Create 4 to 8 flashcards.
- Each flashcard must be a snippet or micro lesson from the note, not a generic section heading.
- The "prompt" must be specific to the card's idea. Never use generic titles like "What I learned", "Key details", "Lesson", or "Summary".
- The "lesson" should be 1 to 3 concise sentences, grounded only in the note.
- Prefer cards that help the user remember useful distinctions, tradeoffs, definitions, and practical implications.
- The "kind" must be exactly one of: "concept", "question", "lesson", "tradeoff", "pattern".
- Use a mix of kinds when the note supports it.

Note metadata:
${JSON.stringify({ id: note.id, title: note.title, category: note.category, tags: note.tags, summary: note.summary }, null, 2)}

Markdown:
${markdown}

Return this exact JSON shape:
{
  "flashcards": [
    { "prompt": "Specific card title", "lesson": "Micro lesson grounded in the note.", "kind": "concept" }
  ]
}
`;
}

function parseFlashcardJson(output: string): any[] {
  const trimmed = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI did not return flashcard JSON');
  const parsed = JSON.parse(trimmed.slice(start, end + 1));
  if (!Array.isArray(parsed.flashcards)) throw new Error('AI flashcard JSON is missing flashcards array');
  return parsed.flashcards;
}

function normalize(note: KnowledgeNote, rawCards: any[]): Flashcard[] {
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
    .map((card): Flashcard => ({
      id: `${note.id}-${randomUUID()}`,
      noteId: note.id,
      noteTitle: note.title,
      category: note.category,
      tags: note.tags,
      prompt: card.prompt,
      lesson: card.lesson,
      kind: card.kind as Flashcard['kind'],
    }));
}

// ---------------------------------------------------------------------------
// File discovery
// ---------------------------------------------------------------------------

async function listMarkdownFiles(dir: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relative = join(prefix, entry.name);
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listMarkdownFiles(absolute, relative));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(relative);
    }
  }
  return files.sort();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: npx tsx scripts/regenerate-flashcards.ts

Re-generates AI flashcards for every note, bypassing the cache. Writes
results directly to the SQLite flashcard_cache table.

Environment variables (same as the server):
  AI_PROVIDER          codex (default) | openrouter
  CODEX_COMMAND        path to the codex CLI (default: codex)
  CODEX_TIMEOUT_MS     timeout per note in ms (default: 180000)
  AI_API_KEY           API key for openrouter/deepseek/ollama
  AI_API_BASE_URL      base URL for the AI API (default: https://openrouter.ai/api/v1)
  AI_MODEL             model name (default: anthropic/claude-3-5-sonnet)
  APP_DB_PATH          path to the SQLite database (default: knowledge/app.sqlite)
`);
  process.exit(0);
}

console.log(`AI provider: ${config.aiProvider}`);
console.log(`Notes dir:   ${config.notesDir}`);
console.log(`DB path:     ${config.appDbPath}`);
console.log('');

const files = await listMarkdownFiles(config.notesDir);
console.log(`Found ${files.length} notes. Generating flashcards...`);

const noteSources: NoteSource[] = [];
for (const file of files) {
  const markdown = await readFile(join(config.notesDir, file), 'utf8');
  noteSources.push({ file, markdown, note: parseNote(file, markdown) });
}

const nextNotes: Record<string, { hash: string; cards: Flashcard[]; generatedAt: string }> = {};
let successCount = 0;
let errorCount = 0;

for (const { file, note, markdown } of noteSources) {
  process.stdout.write(`  [${successCount + errorCount + 1}/${files.length}] ${basename(file)} ... `);
  try {
    const hash = noteHash(note, markdown);
    const prompt = buildPrompt(note, markdown);
    const output = await aiComplete(prompt);
    const rawCards = parseFlashcardJson(output);
    const cards = normalize(note, rawCards);
    nextNotes[note.id] = { hash, cards, generatedAt: new Date().toISOString() };
    console.log(`${cards.length} cards`);
    successCount++;
  } catch (err: any) {
    console.log(`ERROR: ${err?.message ?? err}`);
    errorCount++;
  }
}

console.log('');
console.log(`Saving to SQLite: ${config.appDbPath}`);

const sqlite = new Database(config.appDbPath);
const db = drizzle(sqlite);

sqlite.transaction(() => {
  db.delete(sqliteFlashcardCache).run();
  for (const [noteId, entry] of Object.entries(nextNotes)) {
    db.insert(sqliteFlashcardCache).values({
      noteId,
      hash: entry.hash,
      cards: JSON.stringify(entry.cards),
      generatedAt: entry.generatedAt,
    }).run();
  }
})();

sqlite.close();

const totalCards = Object.values(nextNotes).reduce((sum, e) => sum + e.cards.length, 0);
console.log(`Done. Regenerated ${totalCards} AI flashcards for ${successCount}/${files.length} notes.`);
if (errorCount > 0) {
  console.log(`  ${errorCount} note(s) failed — check errors above.`);
}
console.log(`Cache: ${config.appDbPath} (flashcard_cache table)`);
