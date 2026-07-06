/**
 * End-to-end API tests — spawn the compiled server (server/dist) against a
 * temp working directory and drive every feature area over real HTTP:
 * status, note lifecycle, knowledge state, search, reminders, settings,
 * flashcards, quiz reviews, learn progress, jobs, images, and error paths.
 *
 * Requirements: `npm run server:build` first, and redis on localhost (BullMQ,
 * same as `npm run dev`) — the suite skips itself if either is missing.
 * When the enterprise ee/ tree is linked, its data is isolated to the temp
 * dir and a couple of EE smoke assertions run; without ee/ they are skipped.
 *
 * Run: npm run test:e2e
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'server/dist/main.js');
const PORT = 8790 + (process.pid % 100);
const BASE = `http://localhost:${PORT}`;
const hasEe = existsSync(join(ROOT, 'server/dist/ee'));

function redisUp() {
  return new Promise((resolve) => {
    const sock = createConnection({ host: 'localhost', port: 6379 });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
    sock.setTimeout(1000, () => { sock.destroy(); resolve(false); });
  });
}

const ready = existsSync(ENTRY) && await redisUp();
let server = null;
let tmp = null;

test.before(async () => {
  if (!ready) return;
  tmp = mkdtempSync(join(tmpdir(), 'kl-e2e-'));
  server = spawn('node', [ENTRY], {
    cwd: tmp,
    env: {
      ...process.env,
      PORT: String(PORT),
      KNOWLEDGE_ROOT: tmp,          // all data paths derive from here — never the repo
      CODEX_COMMAND: 'false',       // AI calls fail fast, cost nothing
      ADMIN_TOKEN: 'e2e-staff-token',
      EE_SEED_DEMO: '0',
      EE_QUOTA_PREFIX: `e2e:${process.pid}`,
      SEARCH_PROVIDER: 'inmemory',
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
const get = (p) => api('GET', p);
const post = (p, b) => api('POST', p, b);
const put = (p, b) => api('PUT', p, b);
const patch = (p, b) => api('PATCH', p, b);
const del = (p) => api('DELETE', p);

const maybe = (name, fn) => test(name, { skip: ready ? false : 'needs server/dist build + local redis' }, fn);

// ── status ────────────────────────────────────────────────────────────────────

maybe('status: reports read/write mode', async () => {
  const { status, json } = await get('/api/status');
  assert.equal(status, 200);
  assert.equal(typeof json.readOnly, 'boolean');
});

// ── note lifecycle ────────────────────────────────────────────────────────────

let noteId;

maybe('notes: write-mode capture creates a note synchronously', async () => {
  const { ok, json } = await post('/api/learn', {
    mode: 'write', title: 'E2E Note', body: '# E2E\n\nContent.',
    category: 'Testing/E2E', summary: 'A note', tags: ['e2e'],
  });
  assert.ok(ok);
  assert.equal(json.job.status, 'done');
  assert.equal(json.note.title, 'E2E Note');
  assert.deepEqual(json.note.tags, ['e2e']);
  noteId = json.note.id;
  assert.ok(noteId);
});

maybe('notes: read the created markdown', async () => {
  const { status, json } = await get(`/api/notes/${noteId}`);
  assert.equal(status, 200);
  assert.match(json.markdown, /E2E Note/);
  assert.match(json.markdown, /Content\./);
});

maybe('notes: full update persists', async () => {
  const { status, json } = await put(`/api/notes/${noteId}`, {
    title: 'Updated E2E Note', body: '# Updated\n\nNew content.',
    category: 'Testing/E2E', summary: 'Updated', tags: ['e2e', 'updated'], links: [],
  });
  assert.equal(status, 200);
  assert.equal(json.note.title, 'Updated E2E Note');
  const { json: recheck } = await get(`/api/notes/${noteId}`);
  assert.match(recheck.markdown, /Updated E2E Note/);
});

maybe('notes: partial patch keeps other fields', async () => {
  const { status, json } = await patch(`/api/notes/${noteId}`, { summary: 'Patched summary' });
  assert.equal(status, 200);
  assert.equal(json.note.summary, 'Patched summary');
  assert.equal(json.note.title, 'Updated E2E Note');
});

maybe('notes: mark-read succeeds', async () => {
  const { status, json } = await post(`/api/notes/${noteId}/read`);
  assert.equal(status, 200);
  assert.equal(json.ok, true);
});

maybe('notes: backfill-bilinks runs over the vault', async () => {
  const { status, json } = await post('/api/notes/backfill-bilinks');
  assert.equal(status, 200);
  assert.equal(typeof json.pairsConverted, 'number');
});

maybe('notes: delete removes note and returns fresh state', async () => {
  const { json: c } = await post('/api/learn', {
    mode: 'write', title: 'Delete Me', body: '# Gone', category: 'Testing', summary: '', tags: [],
  });
  const { status, json } = await del(`/api/notes/${c.note.id}`);
  assert.equal(status, 200);
  assert.ok(json.deleted);
  assert.equal((await get(`/api/notes/${c.note.id}`)).status, 404);
});

// ── knowledge state & search ─────────────────────────────────────────────────

maybe('knowledge: state includes notes and categories', async () => {
  const { status, json } = await get('/api/knowledge');
  assert.equal(status, 200);
  assert.ok(json.notes.length > 0);
  assert.ok(Array.isArray(json.categories));
});

maybe('search: finds notes with the in-memory fallback engine', async () => {
  const { status, json } = await get('/api/search?q=updated');
  assert.equal(status, 200);
  assert.equal(json.engine, 'inmemory');
  assert.ok(json.hits.length > 0);
});

// ── reminders ─────────────────────────────────────────────────────────────────

maybe('reminders: create → active → complete → delete', async () => {
  const remindAt = new Date(Date.now() + 365 * 86400000).toISOString();
  const { ok, json: r } = await post('/api/reminders', { noteId, remindAt, message: 'Review' });
  assert.ok(ok);
  const rid = r.reminder.id;

  const { json: active } = await get('/api/reminders?status=active');
  assert.ok(active.reminders.some((x) => x.id === rid));

  assert.equal((await patch(`/api/reminders/${rid}`, { completed: true })).status, 200);
  const { json: after } = await get('/api/reminders?status=active');
  assert.ok(!after.reminders.some((x) => x.id === rid));

  assert.equal((await del(`/api/reminders/${rid}`)).status, 200);
});

maybe('reminders: deleting a note cascades to its reminders', async () => {
  const { json: n } = await post('/api/learn', {
    mode: 'write', title: 'Cascade Note', body: '# C', category: 'Testing', summary: '', tags: [],
  });
  const remindAt = new Date(Date.now() + 86400000).toISOString();
  await post('/api/reminders', { noteId: n.note.id, remindAt, message: 'orphan?' });
  await del(`/api/notes/${n.note.id}`);
  const { json } = await get(`/api/reminders?noteId=${n.note.id}`);
  assert.equal(json.reminders.length, 0);
});

// ── flashcards ────────────────────────────────────────────────────────────────

maybe('flashcards: user card create → update → review → delete', async () => {
  const { ok, json: created } = await post('/api/flashcards', {
    noteId, prompt: 'What is E2E?', lesson: 'End to end.', kind: 'concept',
  });
  assert.ok(ok);
  const cardId = created.flashcard.id;

  assert.equal((await put(`/api/flashcards/${cardId}`, {
    prompt: 'What is E2E really?', lesson: 'Everything, wired.', kind: 'concept',
  })).status, 200);

  const { status, json: reviewed } = await post(`/api/flashcards/${cardId}/review`, {
    rating: 'good', noteId, isUserCard: true,
  });
  assert.equal(status, 200);
  assert.ok(reviewed.review.nextReviewAt > new Date().toISOString());

  assert.ok((await del(`/api/flashcards/${cardId}`)).ok);
});

// ── quiz ──────────────────────────────────────────────────────────────────────

maybe('quiz: FSRS reviews keep the streak counter; hide/restore work', async () => {
  const qid = 'e2e-question-1';
  const first = await post(`/api/quiz/${qid}/review`, { rating: 'correct', noteId, currentStreak: 0 });
  assert.equal(first.status, 200);
  assert.equal(first.json.review.streak, 1);

  const wrong = await post(`/api/quiz/${qid}/review`, { rating: 'wrong', noteId, currentStreak: 1 });
  assert.equal(wrong.json.review.streak, 0);

  assert.ok((await del(`/api/quiz/${qid}`)).ok);            // hide
  assert.ok((await post(`/api/quiz/${qid}/restore`)).ok);   // restore
});

// ── study queue + retention analytics ────────────────────────────────────────

maybe('study: today queue and retention stats reflect submitted reviews', async () => {
  // A user card reviewed 'good' just above scheduled it into the future, so it
  // must NOT be due; the review itself must show up in the stats log.
  const { json: queue } = await get('/api/study/today');
  assert.ok(Array.isArray(queue.flashcards));
  assert.ok(Array.isArray(queue.quiz));
  assert.ok(Array.isArray(queue.reminders));
  assert.equal(typeof queue.counts.dueFlashcards, 'number');

  const { status, json: stats } = await get('/api/study/stats?days=30');
  assert.equal(status, 200);
  assert.ok(stats.totals.reviews >= 3, `expected the flashcard+quiz reviews in the log, got ${stats.totals.reviews}`);
  assert.ok(stats.totals.flashcardReviews >= 1);
  assert.ok(stats.totals.quizReviews >= 2);
  assert.ok(stats.totals.successRate > 0 && stats.totals.successRate <= 1);
  assert.ok(Array.isArray(stats.weakestTopics));
  assert.ok(Array.isArray(stats.categories));
});

maybe('study: exam plan lays out passes toward the exam date', async () => {
  // Give the planner material to schedule (AI cards don't exist in e2e).
  const { json: created } = await post('/api/flashcards', {
    noteId, prompt: 'What is exam mode?', lesson: 'A date-targeted plan.', kind: 'concept',
  });
  assert.ok(created.flashcard?.id);

  const examDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  const { status, json: plan } = await post('/api/study/exam-plan', { examDate });
  assert.equal(status, 201, JSON.stringify(plan));
  assert.equal(plan.examDate, examDate);
  assert.ok(plan.totalItems >= 1, 'the user flashcard is in scope');
  assert.equal(plan.days[plan.days.length - 1].focus, 'exam');
  assert.equal(plan.days[plan.days.length - 2].focus, 'final-review');

  const bad = await post('/api/study/exam-plan', { examDate: '2001-01-01' });
  assert.equal(bad.status, 400);
});

// ── share links ──────────────────────────────────────────────────────────────

maybe('shares: create → public read (no auth) → revoke → 404', async () => {
  const { status, json: share } = await post('/api/shares', { noteId });
  assert.equal(status, 201, JSON.stringify(share));
  assert.ok(share.id.length >= 20, 'unguessable id');
  assert.equal(share.url, `/share/${share.id}`);

  // Public payload is readable without credentials and contains no vault internals.
  const pub = await get(`/api/shares/${share.id}/public`);
  assert.equal(pub.status, 200);
  assert.equal(pub.json.note.title, 'Updated E2E Note');
  assert.ok(pub.json.note.body.length > 0);
  assert.ok(Array.isArray(pub.json.flashcards));
  assert.ok(Array.isArray(pub.json.quiz));
  assert.equal(pub.json.note.links, undefined, 'no vault link ids in public payload');

  // Owner sees it listed; revocation kills the public URL.
  const { json: listed } = await get('/api/shares');
  assert.ok(listed.shares.some((sh) => sh.id === share.id));
  assert.equal((await del(`/api/shares/${share.id}`)).status, 200);
  assert.equal((await get(`/api/shares/${share.id}/public`)).status, 404);

  // Unknown ids 404 rather than leaking anything.
  assert.equal((await get('/api/shares/definitely-not-a-real-id/public')).status, 404);

  // Sharing a nonexistent note is rejected.
  assert.equal((await post('/api/shares', { noteId: 'no-such-note' })).status, 404);
});

maybe('shares: category collection share is public and revocable', async () => {
  const { status, json: share } = await post('/api/shares', { category: 'Testing/E2E' });
  assert.equal(status, 201, JSON.stringify(share));
  assert.equal(share.kind, 'category');

  const pub = await get(`/api/shares/${share.id}/public`);
  assert.equal(pub.status, 200);
  assert.equal(pub.json.kind, 'category');
  assert.equal(pub.json.collection.name, 'Testing/E2E');
  assert.ok(pub.json.notes.length >= 1);
  assert.ok(pub.json.notes.some((n) => n.title === 'Updated E2E Note'));
  assert.ok(pub.json.notes.every((n) => typeof n.body === 'string'));

  // Unknown category is rejected; revocation still works.
  assert.equal((await post('/api/shares', { category: 'No/Such/Category' })).status, 404);
  assert.equal((await del(`/api/shares/${share.id}`)).status, 200);
  assert.equal((await get(`/api/shares/${share.id}/public`)).status, 404);
});

// ── learn progress ────────────────────────────────────────────────────────────

maybe('learn progress: award accumulates XP and starts a streak', async () => {
  const { json: before } = await get('/api/learn-progress');
  await post('/api/learn-progress/award', { xp: 15 });
  const { json: after } = await post('/api/learn-progress/award', { xp: 10 });
  assert.equal(after.xp, before.xp + 25);
  assert.ok(after.todayXp >= 25);
  assert.equal(after.streak, 1);
});

maybe('learn progress: award clamps hostile values to 1000 per call', async () => {
  const { json: before } = await get('/api/learn-progress');
  const { json } = await post('/api/learn-progress/award', { xp: 999999 });
  assert.equal(json.xp, before.xp + 1000);
});

maybe('learn progress: mastery marks a node', async () => {
  const { json } = await post(`/api/learn-progress/master/${noteId}`);
  assert.equal(json.mastery[noteId], 'mastered');
});

maybe('learn progress: generate-deck validates input and degrades without AI', async () => {
  assert.equal((await post('/api/learn-progress/generate-deck', {})).status, 400);
  const { ok, json } = await post('/api/learn-progress/generate-deck', {
    noteId, title: 'X', category: 'Testing', summary: 'S', tags: [],
  });
  assert.ok(ok);          // AI provider fails fast (CODEX_COMMAND=false) …
  assert.equal(json, null); // … so the endpoint returns null and the UI falls back
});

// ── jobs ──────────────────────────────────────────────────────────────────────

maybe('jobs: list contains the write-mode activity records', async () => {
  const { status, json } = await get('/api/jobs');
  assert.equal(status, 200);
  assert.ok(json.jobs.some((j) => j.status === 'done'));
  assert.equal((await get('/api/jobs/nonexistent-job')).status, 404);
});

// ── images ────────────────────────────────────────────────────────────────────

maybe('images: upload a PNG and serve it back', async () => {
  // 1×1 transparent PNG
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const form = new FormData();
  form.append('file', new Blob([png], { type: 'image/png' }), 'dot.png');
  const res = await fetch(`${BASE}/api/images`, { method: 'POST', body: form });
  assert.ok(res.ok);
  const { url } = await res.json();
  const served = await fetch(`${BASE}${url}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
});

maybe('images: rejects disallowed mime types', async () => {
  const form = new FormData();
  form.append('file', new Blob(['#!/bin/sh'], { type: 'application/x-sh' }), 'evil.sh');
  const res = await fetch(`${BASE}/api/images`, { method: 'POST', body: form });
  assert.equal(res.status, 400);
});

// ── error paths ───────────────────────────────────────────────────────────────

maybe('errors: empty write returns 400 with { error }', async () => {
  const { status, json } = await post('/api/learn', { mode: 'write', title: '', body: '' });
  assert.equal(status, 400);
  assert.ok(json.error);
});

maybe('errors: bad link-mode URL returns 400', async () => {
  const { status } = await post('/api/learn', { mode: 'link', title: 'Bad', url: 'not-a-url' });
  assert.equal(status, 400);
});

maybe('errors: unknown note returns 404', async () => {
  assert.equal((await get('/api/notes/fake-id-99999')).status, 404);
});

// ── enterprise smoke (only when ee/ is linked; deep coverage lives in the
//    knowledge-loom-ee repo's own suites) ──────────────────────────────────────

const eeMaybe = (name, fn) => test(name, { skip: ready && hasEe ? false : 'ee/ not linked' }, fn);

eeMaybe('ee smoke: billing catalog is served and admin API is token-gated', async () => {
  const { status, json } = await get('/api/billing/plans');
  assert.equal(status, 200);
  assert.equal(json.plans.length, 4);
  assert.equal((await get('/api/admin/overview')).status, 401);
});

eeMaybe('ee smoke: AI write-mode capture tracks usage for the local account', async () => {
  await post('/api/learn', { mode: 'write', title: 'Usage Ping', body: '# U', category: 'Testing', summary: '', tags: [] });
  const { json } = await get('/api/billing/subscription');
  assert.equal(json.plan.id, 'thread');
  assert.equal(typeof json.usage.aiUsedThisMonth, 'number');
});
