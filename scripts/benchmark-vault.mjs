#!/usr/bin/env node
/**
 * Vault benchmark — measures how rebuild / knowledge-state / search scale with
 * vault size, so regressions in the full-vault pipeline (KnowledgeService
 * rebuild, in-memory search index, study-data generation) are measurable.
 *
 * Generates a synthetic vault of N markdown notes (categories, tags, and link
 * edges for a realistic graph), boots the compiled server against it with jobs
 * disabled and the in-memory search engine, then times:
 *   - cold  : first GET /api/knowledge (full rebuild + derive + index)
 *   - warm  : second GET /api/knowledge (stale-while-revalidate cache)
 *   - mutate: PATCH one note (one changed source + full derived-state rebuild)
 *   - search: GET /api/search?q=...
 *
 * Usage:
 *   npm run server:build
 *   node scripts/benchmark-vault.mjs 100,1000,10000
 *
 * Not part of CI — this is a manual profiling tool.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = process.cwd();
const ENTRY = join(ROOT, 'server/dist/main.js');
const sizes = (process.argv[2] || '100,1000').split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean);
const CATEGORIES = 25;
const TAGS = 15;

function noteMarkdown(i, total) {
  const category = `Topic${i % CATEGORIES}/Sub${i % 4}`;
  const tags = [`tag${i % TAGS}`, `tag${(i * 7) % TAGS}`];
  // Link to a few earlier notes to build graph edges.
  const links = [i - 1, i - 3, i - 7].filter((n) => n >= 0).map((n) => `note-${n}`);
  const q = (arr) => arr.map((v) => `"${v}"`).join(', ');
  return `---
title: "Note ${i} of ${total}"
category: "${category}"
summary: "Synthetic benchmark note number ${i}."
tags: [${q(tags)}]
links: [${q(links)}]
createdAt: "2026-01-01T00:00:00.000Z"

---

# Note ${i}

## What I learned

This is synthetic content for note ${i}. It mentions updated concepts, spaced
repetition, retrieval practice, and cross-links to related material so the
search index and graph have something to chew on. Lorem ipsum topic ${i % CATEGORIES}.
`;
}

function generateVault(dir, n) {
  const notesDir = join(dir, 'knowledge', 'users', 'local', 'notes');
  mkdirSync(notesDir, { recursive: true });
  for (let i = 0; i < n; i++) {
    writeFileSync(join(notesDir, `note-${i}.md`), noteMarkdown(i, n));
  }
}

async function timed(label, fn) {
  const start = performance.now();
  const out = await fn();
  return { label, ms: +(performance.now() - start).toFixed(1), out };
}

async function benchOne(size, port) {
  const dir = mkdtempSync(join(tmpdir(), `kl-bench-${size}-`));
  generateVault(dir, size);
  const server = spawn('node', [ENTRY], {
    env: { ...process.env, PORT: String(port), KNOWLEDGE_ROOT: dir, SKIP_JOBS: '1', SEARCH_PROVIDER: 'inmemory', CODEX_COMMAND: 'false', PUBLIC_RATE_LIMIT_STORE: 'memory' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let err = '';
  server.stderr.on('data', (d) => { err += d; });
  const base = `http://localhost:${port}`;
  try {
    for (let i = 0; i < 120; i++) {
      try { if ((await fetch(`${base}/api/status`)).ok) break; } catch { /* booting */ }
      await sleep(500);
      if (i === 119) throw new Error(`server did not boot for size ${size}\n${err.slice(-1000)}`);
    }
    const cold = await timed('cold', () => fetch(`${base}/api/knowledge`).then((r) => r.text()));
    const warm = await timed('warm', () => fetch(`${base}/api/knowledge`).then((r) => r.text()));
    const state = JSON.parse(cold.out);
    const first = state.notes[0];
    const mutate = await timed('mutate', () => fetch(`${base}/api/notes/${encodeURIComponent(first.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ summary: `${first.summary} updated` }),
    }).then((r) => r.text()));
    const search = await timed('search', () => fetch(`${base}/api/search?q=synthetic`).then((r) => r.json()));
    const payloadKB = Math.round(cold.out.length / 1024);
    return { size, coldMs: cold.ms, warmMs: warm.ms, mutateMs: mutate.ms, searchMs: search.ms, hits: search.out.hits?.length ?? 0, payloadKB };
  } finally {
    server.kill('SIGKILL');
    rmSync(dir, { recursive: true, force: true });
  }
}

const rows = [];
let port = 8850;
for (const size of sizes) {
  process.stdout.write(`benchmarking ${size} notes… `);
  rows.push(await benchOne(size, port++));
  console.log('done');
}

console.log('\nnotes | cold(ms) | warm(ms) | mutate(ms) | search(ms) | hits | payload(KB)');
console.log('------|----------|----------|------------|------------|------|------------');
for (const r of rows) {
  console.log(
    `${String(r.size).padStart(5)} | ${String(r.coldMs).padStart(8)} | ${String(r.warmMs).padStart(8)} | ${String(r.mutateMs).padStart(10)} | ${String(r.searchMs).padStart(10)} | ${String(r.hits).padStart(4)} | ${String(r.payloadKB).padStart(11)}`,
  );
}
