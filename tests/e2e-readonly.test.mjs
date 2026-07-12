/**
 * Read-only route matrix — boots the compiled server with KNOWLEDGE_READ_ONLY=1
 * and asserts that every durable-write endpoint is refused with 403.
 *
 * Guards run before the body/file is ever parsed, so minimal payloads are fine.
 * Endpoints that don't mutate durable user state (exam-plan, generate-deck, tts
 * podcast, note read-tracking) are intentionally not in the matrix.
 *
 * Requires the build (npm run server:build). Redis is not needed — SKIP_JOBS=1.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'server/dist/main.js');
const PORT = 8841;
const BASE = `http://localhost:${PORT}`;
const ready = existsSync(ENTRY);
const maybe = (name, fn) => test(name, { skip: ready ? false : 'server not built' }, fn);

let server = null;
let tmp = null;

test.before(async () => {
  if (!ready) return;
  tmp = mkdtempSync(join(tmpdir(), 'kl-ro-'));
  server = spawn('node', [ENTRY], {
    env: { ...process.env, PORT: String(PORT), KNOWLEDGE_ROOT: tmp, KNOWLEDGE_READ_ONLY: '1', SKIP_JOBS: '1', SEARCH_PROVIDER: 'inmemory', CODEX_COMMAND: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${BASE}/api/status`)).ok) return; } catch { /* booting */ }
    await sleep(500);
  }
  throw new Error(`read-only server did not boot on :${PORT}\n${log.slice(-1500)}`);
});

test.after(() => {
  server?.kill('SIGKILL');
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

// [method, path, body?] — every durable-write route across every controller.
const MUTATIONS = [
  ['POST', '/api/learn', { mode: 'write', title: 'x', body: 'y' }],
  ['PUT', '/api/notes/n1', { body: 'x' }],
  ['PATCH', '/api/notes/n1', { body: 'x' }],
  ['DELETE', '/api/notes/n1'],
  ['POST', '/api/notes/n1/regenerate', {}],
  ['POST', '/api/notes/assist-draft', { prompt: 'x' }],
  ['POST', '/api/notes/n1/assist', { prompt: 'x' }],
  ['POST', '/api/notes/backfill-bilinks'],
  ['POST', '/api/flashcards', { noteId: 'n1', prompt: 'p', lesson: 'l', kind: 'concept' }],
  ['PUT', '/api/flashcards/c1', { prompt: 'p', lesson: 'l', kind: 'concept' }],
  ['DELETE', '/api/flashcards/c1'],
  ['POST', '/api/flashcards/c1/review', { rating: 'good', noteId: 'n1' }],
  ['POST', '/api/quiz/q1/review', { rating: 'correct', noteId: 'n1' }],
  ['DELETE', '/api/quiz/q1'],
  ['POST', '/api/quiz/q1/restore'],
  ['POST', '/api/reminders', { noteId: 'n1', remindAt: '2099-01-01T00:00:00.000Z' }],
  ['PATCH', '/api/reminders/r1', { completed: true }],
  ['DELETE', '/api/reminders/r1'],
  ['PATCH', '/api/settings', { theme: 'dark' }],
  ['POST', '/api/spaces', { name: 'X' }],
  ['POST', '/api/spaces/transfer-note', { noteId: 'n1', fromSpaceId: 'default', toSpaceId: 's1', mode: 'move' }],
  ['PATCH', '/api/spaces/s1', { name: 'Y' }],
  ['DELETE', '/api/spaces/s1'],
  ['POST', '/api/import', { text: 'some text' }],
  ['POST', '/api/images', {}],
  ['POST', '/api/shares', { noteId: 'n1' }],
  ['POST', '/api/export/restore'],
  ['POST', '/api/marketplace/publish', { shareId: 's1', title: 'T' }],
  ['DELETE', '/api/marketplace/m1'],
  ['POST', '/api/marketplace/m1/rate', { stars: 5 }],
  ['POST', '/api/marketplace/m1/import'],
  ['POST', '/api/learn-progress/award', { xp: 10 }],
  ['POST', '/api/learn-progress/master/n1'],
];

for (const [method, path, body] of MUTATIONS) {
  maybe(`read-only: ${method} ${path} → 403`, async () => {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    assert.equal(res.status, 403, `${method} ${path} should be refused in read-only mode`);
  });
}
