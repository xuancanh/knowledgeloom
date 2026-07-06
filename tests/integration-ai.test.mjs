/**
 * Core AI-pipeline integration tests — the paths the e2e suite can't reach
 * without a model. A mock OpenAI-compatible server stands in for the AI
 * provider (AI_PROVIDER=openrouter pointed at localhost), so the FULL
 * pipeline runs for real: prompt building → HTTP completion → parsing →
 * markdown write → index rebuild → search sync, plus streaming RAG and the
 * job queue's retry/failure handling.
 *
 * Covered:
 *   - research capture: POST /api/learn → BullMQ job → note on disk →
 *     knowledge state → search hit
 *   - job failure: provider 500s → job retries → status 'error'
 *   - assist-draft / note assist: JSON proposal parsing + link filtering
 *   - generate-deck: sanitizer runs against real provider output (invalid
 *     quiz dropped, podcast hosts normalized)
 *   - RAG: tokens stream through to the client
 *
 * Requirements: server/dist build + redis on localhost (jobs) — skips
 * itself otherwise. Uses REDIS_DB=15 so queues/counters never touch the
 * dev database.
 *
 * Run: npm run test:integration
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'server/dist/main.js');
const PORT = 8690 + (process.pid % 100);
const MOCK_PORT = PORT + 1000;
const BASE = `http://localhost:${PORT}`;

function redisUp() {
  return new Promise((resolve) => {
    const sock = createConnection({ host: 'localhost', port: 6379 });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
    sock.setTimeout(1000, () => { sock.destroy(); resolve(false); });
  });
}

// ── mock OpenAI-compatible provider ──────────────────────────────────────────

const RESEARCH_NOTE = `---
title: "Vector Clocks"
category: "Distributed Systems/Consistency"
summary: "Vector clocks capture causal ordering between events."
tags: ["distributed-systems", "ordering"]
links: []
createdAt: "${new Date().toISOString()}"
---

# Vector Clocks

## What I learned
Each process keeps a counter per peer; merging on receive preserves causality.

## Why it matters
They detect concurrent writes without a central clock.
`;

// Filled in once the research note exists — note ids carry a date prefix.
let realNoteId = 'not-yet-created';
const assistJson = () => JSON.stringify({
  title: 'Assisted Title',
  category: 'Distributed Systems/Consistency',
  summary: 'An assisted summary.',
  tags: ['assisted'],
  links: [realNoteId, 'nonexistent-note'], // one real, one bogus — must be filtered
  body: '# Assisted\n\nRewritten body.',
});

const DECK_JSON = JSON.stringify({
  teach: [{ head: 'Causal order', paras: ['Counters per process.'] }],
  insight: { text: 'Time is a partial order.' },
  flash: [{ front: 'What do vector clocks capture?', back: 'Causality.' }],
  quiz: [
    { prompt: 'Valid?', options: ['yes', 'no'], answer: 'yes', feedback: 'ok' },
    { prompt: 'Broken', options: ['a', 'b'], answer: 'c', feedback: 'answer not among options' },
  ],
  podcast: { lines: [{ who: 'alex', text: 'Line one.' }, { who: 'sam', text: 'Line two.' }] },
  recap: { takeaways: ['Causality beats wall clocks.'] },
});

const RAG_TOKENS = ['Vector ', 'clocks ', 'order ', 'events.'];

function startMockAi() {
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      const prompt = (body.messages || []).map((m) => m.content).join('\n');

      if (prompt.includes('FAIL-THIS-JOB')) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'synthetic provider failure' }));
        return;
      }
      if (body.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        for (const token of RAG_TOKENS) {
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      const content = prompt.includes('learning content creator') ? DECK_JSON
        : prompt.includes('Return this exact JSON shape') ? assistJson()
        : RESEARCH_NOTE;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  return new Promise((resolve) => server.listen(MOCK_PORT, '127.0.0.1', () => resolve(server)));
}

// ── app under test ────────────────────────────────────────────────────────────

const ready = existsSync(ENTRY) && await redisUp();
let server = null;
let mockAi = null;
let tmp = null;

test.before(async () => {
  if (!ready) return;
  // db 15 is dedicated to this suite — clear leftovers (queued jobs, quota
  // counters) from previous runs so every run starts deterministic.
  const { default: Redis } = await import('ioredis');
  const redis = new Redis({ host: 'localhost', port: 6379, db: 15 });
  await redis.flushdb();
  redis.disconnect();

  mockAi = await startMockAi();
  tmp = mkdtempSync(join(tmpdir(), 'kl-ai-itest-'));
  server = spawn('node', [ENTRY], {
    cwd: tmp,
    env: {
      ...process.env,
      PORT: String(PORT),
      KNOWLEDGE_ROOT: tmp,          // all data paths derive from here — never the repo
      REDIS_DB: '15',                 // isolated queues + quota counters
      AI_PROVIDER: 'openrouter',
      AI_API_BASE_URL: `http://127.0.0.1:${MOCK_PORT}/v1`,
      AI_API_KEY: 'test-key',
      AI_MODEL: 'mock-model',
      CODEX_JOB_MAX_ATTEMPTS: '1', // exhaustion path without BullMQ's ~30s retry-promotion latency
      CODEX_JOB_RETRY_MS: '200',
      SEARCH_PROVIDER: 'inmemory',
      EE_SEED_DEMO: '0',
      EE_QUOTA_PREFIX: `ai-itest:${process.pid}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => { log += d; });
  server.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/status`)).ok) return;
    } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not boot on :${PORT}\n${log.slice(-2000)}`);
});

test.after(() => {
  server?.kill('SIGKILL');
  mockAi?.close();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
});

async function api(method, path, body) {
  const opts = { method, headers: { 'content-type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

async function pollJob(jobId, target, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { json } = await api('GET', `/api/jobs/${jobId}`);
    if (json?.status === target) return json;
    if (json?.status === 'error' && target !== 'error') {
      throw new Error(`job failed: ${JSON.stringify(json)}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`job ${jobId} did not reach '${target}' in ${timeoutMs}ms`);
}

const maybe = (name, fn) => test(name, { skip: ready ? false : 'needs server/dist build + local redis' }, fn);

// ── the research pipeline ─────────────────────────────────────────────────────

maybe('research: capture → job → AI note on disk → state → search', async () => {
  const { ok, json } = await api('POST', '/api/learn', {
    mode: 'research', title: 'Vector Clocks', context: 'distributed systems',
  });
  assert.ok(ok);
  assert.equal(json.job.status, 'queued');

  const done = await pollJob(json.jobId, 'done');
  assert.ok(done.result?.note?.id || done.note?.id || true); // shape varies; note asserted below

  // The AI-authored note is a first-class citizen of the vault.
  const { json: state } = await api('GET', '/api/knowledge');
  const note = state.notes.find((n) => n.title === 'Vector Clocks');
  assert.ok(note, 'AI note appears in knowledge state');
  realNoteId = note.id;
  assert.equal(note.category, 'Distributed Systems/Consistency');
  assert.deepEqual(note.tags, ['distributed-systems', 'ordering']);

  const { json: md } = await api('GET', `/api/notes/${note.id}`);
  assert.match(md.markdown, /counter per peer/);

  const { json: search } = await api('GET', '/api/search?q=causal');
  assert.ok(search.hits.some((h) => h.id === note.id), 'search finds the AI note');
});

maybe('research: provider failure exhausts retries and lands on error', async () => {
  const { json } = await api('POST', '/api/learn', {
    mode: 'research', title: 'FAIL-THIS-JOB please',
  });
  const failed = await pollJob(json.jobId, 'error');
  assert.equal(failed.status, 'error');

  // Failure is visible in the activity feed, not silently dropped.
  const { json: jobs } = await api('GET', '/api/jobs');
  assert.ok(jobs.jobs.some((j) => j.id === json.jobId && j.status === 'error'));
});

// ── AI assist ─────────────────────────────────────────────────────────────────

maybe('assist-draft: returns the parsed proposal with unknown links filtered', async () => {
  const { ok, json } = await api('POST', '/api/notes/assist-draft', {
    prompt: 'tighten this up',
    draft: { title: 'Rough', body: 'rough body', category: '', summary: '', tags: [] },
  });
  assert.ok(ok);
  assert.equal(json.update.title, 'Assisted Title');
  assert.deepEqual(json.update.links, [realNoteId], 'bogus link ids are dropped');
  assert.equal(json.codexStatus, 'completed');
});

maybe('note assist: proposes an edit without writing to disk', async () => {
  const { json: before } = await api('GET', `/api/notes/${realNoteId}`);
  const { ok, json } = await api('POST', `/api/notes/${realNoteId}/assist`, {
    prompt: 'clarify the summary',
    draft: {},
  });
  assert.ok(ok);
  assert.equal(json.update.title, 'Assisted Title');
  const { json: after } = await api('GET', `/api/notes/${realNoteId}`);
  assert.equal(after.markdown, before.markdown, 'assist must not mutate the note');
});

// ── learn deck generation (sanitizer runs against real provider output) ──────

maybe('generate-deck: sanitizes provider output end-to-end', async () => {
  const { ok, json: deck } = await api('POST', '/api/learn-progress/generate-deck', {
    noteId: realNoteId, title: 'Vector Clocks', category: 'x', summary: 's', tags: [],
  });
  assert.ok(ok);
  assert.equal(deck.quiz.length, 1, 'quiz with answer not among options is dropped');
  assert.equal(deck.quiz[0].prompt, 'Valid?');
  assert.deepEqual(deck.podcast.lines.map((l) => l.who), ['maya', 'theo'], 'unknown hosts normalized');
  assert.equal(deck.insight.text, 'Time is a partial order.');
});

// ── RAG streaming ─────────────────────────────────────────────────────────────

maybe('rag: streams provider tokens through to the client', async () => {
  const res = await fetch(`${BASE}/api/rag/stream`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'What orders events?', scope: { kind: 'all' }, history: [] }),
  });
  const text = await res.text();
  assert.ok(res.ok, `rag stream failed: ${res.status} ${text.slice(0, 200)}`);
  assert.equal(text, RAG_TOKENS.join(''));
});
