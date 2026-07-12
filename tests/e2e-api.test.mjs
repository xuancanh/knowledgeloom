/**
 * End-to-end API tests — spawn the compiled server (server/dist) against a
 * temp working directory and drive every feature area over real HTTP:
 * status, note lifecycle, knowledge state, search, reminders, settings,
 * flashcards, quiz reviews, learn progress, jobs, images, and error paths.
 *
 * Requirements: `npm run server:build` first, and redis on localhost (BullMQ,
 * same as `npm run dev`) — the suite skips itself if either is missing.
 * When the private extensions/ tree is linked, its data is isolated to the
 * temp dir and a couple of smoke assertions run; without it they are skipped.
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
const hasExtensions = existsSync(join(ROOT, 'server/dist/extensions'));

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
      EXT_SEED_DEMO: '0',
      EXT_QUOTA_PREFIX: `e2e:${process.pid}`,
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

maybe('notes: concurrent edits reject the stale writer', async () => {
  const opened = await fetch(`${BASE}/api/notes/${noteId}`);
  assert.equal(opened.status, 200);
  const document = await opened.json();
  const etag = opened.headers.get('etag');
  assert.ok(etag);
  assert.equal(etag, `"${document.version}"`);

  const request = (summary) => fetch(`${BASE}/api/notes/${noteId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'if-match': etag },
    body: JSON.stringify({ summary }),
  });
  const responses = await Promise.all([request('Concurrent edit A'), request('Concurrent edit B')]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);

  const winner = await responses.find((response) => response.status === 200).json();
  const recheck = await (await fetch(`${BASE}/api/notes/${noteId}`)).json();
  assert.equal(recheck.version, winner.version);
  assert.match(recheck.markdown, /summary: "Concurrent edit [AB]"/);
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
  assert.equal(json.searchStatus.engine, 'inmemory');
  assert.equal(json.searchStatus.state, 'healthy');
});

maybe('knowledge: conditional GET returns 304 when unchanged (ETag)', async () => {
  const first = await fetch(`${BASE}/api/knowledge`);
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.ok(etag, 'response should carry an ETag');
  const second = await fetch(`${BASE}/api/knowledge`, { headers: { 'If-None-Match': etag } });
  assert.equal(second.status, 304);
  assert.equal(await second.text(), '');
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

maybe('shares: expiring link carries an expiry and is live until it lapses', async () => {
  const { status, json: share } = await post('/api/shares', { noteId, expiresInDays: 7 });
  assert.equal(status, 201);
  assert.ok(share.expiresAt, 'response should include expiresAt');
  assert.ok(Date.parse(share.expiresAt) > Date.now(), 'expiry should be in the future');
  // Not yet expired → still publicly readable.
  assert.equal((await get(`/api/shares/${share.id}/public`)).status, 200);
  // Out-of-range TTL is rejected by validation.
  assert.equal((await post('/api/shares', { noteId, expiresInDays: 9999 })).status, 400);
});

maybe('shares: password protection gates content and records successful access', async () => {
  const password = 'correct horse battery staple';
  const { status, json: share } = await post('/api/shares', { noteId, password });
  assert.equal(status, 201, JSON.stringify(share));
  assert.equal(share.passwordProtected, true);

  const locked = await get(`/api/shares/${share.id}/public`);
  assert.equal(locked.status, 401);
  assert.equal(locked.json.passwordRequired, true);

  const wrong = await post(`/api/shares/${share.id}/public`, { password: 'not the password' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.json.passwordRequired, true);

  const unlocked = await post(`/api/shares/${share.id}/public`, { password });
  assert.equal(unlocked.status, 200);
  assert.equal(unlocked.json.note.title, 'Updated E2E Note');

  const listed = await get('/api/shares');
  const own = listed.json.shares.find((item) => item.id === share.id);
  assert.equal(own.passwordProtected, true);
  assert.equal(own.passwordHash, undefined, 'password derivation must never leave the server');

  const accesses = await get(`/api/shares/${share.id}/accesses`);
  assert.equal(accesses.status, 200);
  assert.equal(accesses.json.accesses.length, 1, 'failed unlocks are not logged as reads');
  assert.ok(Date.parse(accesses.json.accesses[0].accessedAt) <= Date.now());

  assert.equal((await post('/api/shares', { noteId, password: 'short' })).status, 400);
  const publish = await post('/api/marketplace/publish', { shareId: share.id, title: 'Private' });
  assert.equal(publish.status, 400, 'protected content cannot bypass its password via marketplace');
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

  const listing = await post('/api/marketplace/publish', {
    shareId: share.id,
    title: 'E2E collection preview',
  });
  assert.equal(listing.status, 201);
  const detail = await get(`/api/marketplace/${listing.json.listing.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.payload.kind, 'category');
  assert.equal(detail.json.payload.collection.truncated, undefined);
  assert.equal((await del(`/api/marketplace/${listing.json.listing.id}`)).status, 200);

  // Unknown category is rejected; revocation still works.
  assert.equal((await post('/api/shares', { category: 'No/Such/Category' })).status, 404);
  assert.equal((await del(`/api/shares/${share.id}`)).status, 200);
  assert.equal((await get(`/api/shares/${share.id}/public`)).status, 404);
});

// ── marketplace ───────────────────────────────────────────────────────────────

maybe('marketplace: publish → browse → import clones notes with seeded deck → unpublish', async () => {
  // Fresh source note + user card so the imported deck has content.
  const { json: src } = await post('/api/learn', {
    mode: 'write', title: 'Marketplace Source', body: '# Source\n\nSpacing beats cramming for retention over weeks.',
    category: 'Published/Decks', summary: 'Deck source', tags: ['market'],
  });
  const srcId = src.note.id;

  const { json: share } = await post('/api/shares', { noteId: srcId });

  // Publish requires title; duplicate publish of the same share is rejected.
  assert.equal((await post('/api/marketplace/publish', { shareId: share.id })).status, 400);
  const { status: pubStatus, json: pub } = await post('/api/marketplace/publish', {
    shareId: share.id, title: 'Spacing Effect Deck', description: 'Learn why spacing wins.',
    tags: ['memory'], author: 'e2e',
  });
  assert.equal(pubStatus, 201, JSON.stringify(pub));
  const listingId = pub.listing.id;
  assert.equal((await post('/api/marketplace/publish', { shareId: share.id, title: 'again' })).status, 400);

  // Public browse + search + detail.
  const { json: browse } = await get('/api/marketplace?q=spacing');
  assert.ok(browse.listings.some((l) => l.id === listingId));
  const { json: detail } = await get(`/api/marketplace/${listingId}`);
  assert.equal(detail.payload.note.title, 'Marketplace Source');
  assert.equal(detail.shareUrl, `/share/${share.id}`);

  // Import: the note is cloned under a new id and appears in the vault.
  const { status: impStatus, json: imp } = await post(`/api/marketplace/${listingId}/import`);
  assert.equal(impStatus, 200, JSON.stringify(imp.imported ?? imp));
  assert.equal(imp.imported.notes.length, 1);
  const cloneId = imp.imported.notes[0];
  assert.notEqual(cloneId, srcId, 'clone gets its own id');
  const { json: cloneMd } = await get(`/api/notes/${cloneId}`);
  assert.match(cloneMd.markdown, /Spacing beats cramming/);

  // Import count incremented; unpublish removes it from the gallery.
  const { json: after } = await get(`/api/marketplace/${listingId}`);
  assert.equal(after.listing.imports, 1);

  // Quality signals: unrated listings expose null/0; validation and the
  // self-rating guard hold (local mode has a single user = the owner).
  assert.equal(after.listing.avgStars, null);
  assert.equal(after.listing.ratingCount, 0);
  assert.ok(Array.isArray(after.comments));
  assert.equal((await post(`/api/marketplace/${listingId}/rate`, { stars: 9 })).status, 400);
  const selfRate = await post(`/api/marketplace/${listingId}/rate`, { stars: 5 });
  assert.equal(selfRate.status, 400);
  assert.match(selfRate.json.error, /own listing/);
  assert.equal((await post('/api/marketplace/nope/rate', { stars: 4 })).status, 404);

  // Reporting: the self-report guard holds (single-user local mode) and an
  // unknown listing 404s. The auto-unpublish threshold needs distinct users.
  const selfReport = await post(`/api/marketplace/${listingId}/report`, { reason: 'spam' });
  assert.equal(selfReport.status, 400);
  assert.match(selfReport.json.error, /own listing/);
  assert.equal((await post('/api/marketplace/nope/report', { reason: 'x' })).status, 404);

  const { json: sorted } = await get('/api/marketplace?sort=rating');
  assert.ok(Array.isArray(sorted.listings));
  assert.equal((await del(`/api/marketplace/${listingId}`)).status, 200);
  assert.equal((await get(`/api/marketplace/${listingId}`)).status, 404);
  const { json: gone } = await get('/api/marketplace?q=spacing');
  assert.ok(!gone.listings.some((l) => l.id === listingId));
});

// ── feature toggles ───────────────────────────────────────────────────────────

maybe('settings: disabling a learning feature empties it from state and gates regen', async () => {
  // A user flashcard exists (created in the exam-plan test); prove it's visible.
  const { json: before } = await get('/api/knowledge');
  assert.ok(before.flashcards.length >= 1, 'baseline: flashcards present');
  const quizBefore = before.quizQuestions.length;

  // Disable flashcards only. The next rebuild (triggered by a note write)
  // must drop them from state while quiz is untouched.
  assert.equal((await patch('/api/settings', { features: { flashcards: false } })).status, 200);
  const { json: created } = await post('/api/learn', {
    mode: 'write', title: 'Toggle Probe', body: '# Probe\n\nContent for the toggle test.',
    category: 'Testing/Toggles', summary: '', tags: [],
  });
  assert.deepEqual(created.state.flashcards, [], 'flashcards gone from rebuilt state');
  assert.equal(created.state.quizQuestions.length, quizBefore, 'quiz unaffected');

  // Regeneration for the disabled feature is rejected outright.
  const regen = await post(`/api/notes/${created.note.id}/regenerate`, { target: 'flashcards' });
  assert.equal(regen.status, 400);
  assert.match(regen.json.error, /disabled in settings/);

  // Re-enable: cached/user material returns on the next rebuild — nothing was lost.
  assert.equal((await patch('/api/settings', { features: { flashcards: true } })).status, 200);
  const { json: after } = await post('/api/learn', {
    mode: 'write', title: 'Toggle Probe Two', body: '# Probe 2\n\nMore content here.',
    category: 'Testing/Toggles', summary: '', tags: [],
  });
  assert.ok(after.state.flashcards.length >= 1, 'flashcards restored after re-enabling');
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

maybe('jobs: metrics summarize queue health (and "metrics" is not a job id)', async () => {
  const { status, json } = await get('/api/jobs/metrics');
  assert.equal(status, 200, 'metrics must resolve before the :id route');
  assert.ok(json.total >= 1);
  assert.ok(json.byStatus.done >= 1);
  assert.equal(json.pending, json.byStatus.queued + json.byStatus.running);
  assert.ok(Number.isFinite(json.oldestPendingAgeMs));
  assert.ok(Array.isArray(json.recentErrors));
});

let backupBundle;

maybe('export: downloadable backup bundles every note + settings', async () => {
  const res = await fetch(`${BASE}/api/export`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename=.*backup.*\.json/);
  backupBundle = await res.json();
  assert.equal(backupBundle.format, 'knowledge-loom-export/v1');
  assert.ok(backupBundle.noteCount >= 1);
  assert.equal(backupBundle.notes.length, backupBundle.noteCount);
  assert.ok(backupBundle.notes[0].file && typeof backupBundle.notes[0].markdown === 'string');
  assert.ok(backupBundle.settings && typeof backupBundle.settings === 'object');
});

maybe('restore: preview conflicts then restore notes and settings with rename policy', async () => {
  const restoredMarkdown = [
    '---',
    'title: "Restored E2E Note"',
    'category: "Testing/Restore"',
    'summary: "Restored from backup"',
    'tags: "restore"',
    'links: ""',
    'createdAt: "2026-01-01T00:00:00.000Z"',
    '---',
    '',
    '# Restored E2E Note',
    '',
    'Portable content.',
  ].join('\n');
  const restoreBundle = {
    ...backupBundle,
    notes: [
      backupBundle.notes[0],
      { file: 'Testing/Restore/restored-e2e.md', markdown: restoredMarkdown },
    ],
    noteCount: 2,
    settings: { restoreE2eMarker: 'restored' },
  };

  const request = async (dryRun) => {
    const form = new FormData();
    form.append('file', new Blob([JSON.stringify(restoreBundle)], { type: 'application/json' }), 'backup.json');
    form.append('policy', 'rename');
    form.append('dryRun', dryRun ? '1' : '0');
    form.append('restoreSettings', '1');
    const response = await fetch(`${BASE}/api/export/restore`, { method: 'POST', body: form });
    return { status: response.status, json: await response.json() };
  };

  const preview = await request(true);
  assert.equal(preview.status, 201, JSON.stringify(preview.json));
  assert.equal(preview.json.dryRun, true);
  assert.equal(preview.json.conflicts.length, 1);
  assert.equal(preview.json.renamed, 1);
  assert.equal(preview.json.created, 1);

  const restored = await request(false);
  assert.equal(restored.status, 201, JSON.stringify(restored.json));
  assert.equal(restored.json.restoredSettings, true);
  const state = await get('/api/knowledge');
  assert.ok(state.json.notes.some((note) => note.title === 'Restored E2E Note'));
  const exported = await (await fetch(`${BASE}/api/export`)).json();
  assert.equal(exported.settings.restoreE2eMarker, 'restored');

  const unsafe = new FormData();
  unsafe.append('file', new Blob([bundleWithTraversal()], { type: 'application/json' }), 'unsafe.json');
  const rejected = await fetch(`${BASE}/api/export/restore`, { method: 'POST', body: unsafe });
  assert.equal(rejected.status, 400);
});

function bundleWithTraversal() {
  return JSON.stringify({
    format: 'knowledge-loom-export/v1',
    notes: [{ file: '../escape.md', markdown: '# Escape' }],
  });
}

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

maybe('images: rejects a non-image body spoofing an allowed mime type', async () => {
  const form = new FormData();
  // Claims image/png but the bytes are a script — magic-byte sniffing must reject.
  form.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'fake.png');
  const res = await fetch(`${BASE}/api/images`, { method: 'POST', body: form });
  assert.equal(res.status, 400);
});

maybe('images: rejects SVG active content', async () => {
  const form = new FormData();
  form.append('file', new Blob([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  ], { type: 'image/svg+xml' }), 'active.svg');
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

// ── spaces ────────────────────────────────────────────────────────────────────

async function apiIn(spaceId, method, path, body) {
  const opts = { method, headers: { 'content-type': 'application/json', 'x-space-id': spaceId } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, json };
}

let spaceId;
let spaceNoteId;

maybe('spaces: list starts with the default space', async () => {
  const { status, json } = await get('/api/spaces');
  assert.equal(status, 200);
  assert.equal(json.spaces[0].id, 'default');
  assert.equal(json.spaces[0].builtin, true);
});

maybe('spaces: create, rename, and full isolation from the default space', async () => {
  const created = await post('/api/spaces', { name: 'Med School' });
  assert.equal(created.status, 201);
  spaceId = created.json.id;
  assert.ok(spaceId);

  const renamed = await patch(`/api/spaces/${spaceId}`, { name: 'Medicine' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.json.name, 'Medicine');

  // A note created inside the space...
  const note = await apiIn(spaceId, 'POST', '/api/learn', {
    mode: 'write', title: 'Anatomy Basics', body: '# Anatomy\n\nBones.',
    category: 'Medicine', summary: 'Bones', tags: ['anatomy'], links: [noteId],
  });
  assert.ok(note.ok);
  spaceNoteId = note.json.note.id;

  // ...is visible in that space and invisible in the default space.
  const inSpace = await apiIn(spaceId, 'GET', '/api/knowledge');
  assert.ok(inSpace.json.notes.some((n) => n.title === 'Anatomy Basics'));
  const inDefault = await get('/api/knowledge');
  assert.ok(!inDefault.json.notes.some((n) => n.title === 'Anatomy Basics'));
  // And default-space notes don't leak into the new space.
  assert.ok(!inSpace.json.notes.some((n) => n.title === 'Updated E2E Note'));
});

maybe('spaces: notes can be copied and moved between owned spaces', async () => {
  const copied = await post('/api/spaces/transfer-note', {
    noteId,
    fromSpaceId: 'default',
    toSpaceId: spaceId,
    mode: 'copy',
  });
  assert.equal(copied.status, 200, JSON.stringify(copied.json));
  assert.equal(copied.json.mode, 'copy');
  assert.match((await apiIn(spaceId, 'GET', `/api/notes/${noteId}`)).json.markdown, /Updated E2E Note/);
  assert.equal((await get(`/api/notes/${noteId}`)).status, 200, 'copy keeps the source note');
  assert.equal((await post('/api/spaces/transfer-note', {
    noteId,
    fromSpaceId: 'default',
    toSpaceId: spaceId,
    mode: 'copy',
  })).status, 409, 'destination id collisions are never overwritten');

  await apiIn(spaceId, 'POST', '/api/reminders', {
    noteId: spaceNoteId,
    remindAt: '2099-01-01T00:00:00.000Z',
  });
  const moved = await post('/api/spaces/transfer-note', {
    noteId: spaceNoteId,
    fromSpaceId: spaceId,
    toSpaceId: 'default',
    mode: 'move',
  });
  assert.equal(moved.status, 200, JSON.stringify(moved.json));
  assert.equal((await apiIn(spaceId, 'GET', `/api/notes/${spaceNoteId}`)).status, 404);
  const destination = await get(`/api/notes/${spaceNoteId}`);
  assert.equal(destination.status, 200);
  assert.match(destination.json.markdown, /title: "Anatomy Basics"/);
  assert.match(destination.json.markdown, /links: \[\]/, 'cross-space links are removed');
  const sourceReminders = await apiIn(spaceId, 'GET', `/api/reminders?noteId=${spaceNoteId}`);
  assert.deepEqual(sourceReminders.json.reminders, []);
});

maybe('spaces: forged or malformed x-space-id headers are rejected', async () => {
  assert.equal((await apiIn('s0000000000', 'GET', '/api/knowledge')).status, 404);
  assert.equal((await apiIn('../escape', 'GET', '/api/knowledge')).status, 400);
});

maybe('spaces: the default space cannot be renamed or deleted', async () => {
  assert.equal((await patch('/api/spaces/default', { name: 'X' })).status, 400);
  assert.equal((await del('/api/spaces/default')).status, 400);
});

maybe('spaces: delete erases the space and its data', async () => {
  const { status, json: deleted } = await del(`/api/spaces/${spaceId}`);
  assert.equal(status, 200, deleted?.error);
  const { json } = await get('/api/spaces');
  assert.ok(!json.spaces.some((s) => s.id === spaceId));
  // The scope is gone — requests against it now 404 at the guard.
  assert.equal((await apiIn(spaceId, 'GET', '/api/knowledge')).status, 404);
});

maybe('spaces: the plan limit counts the default space and is enforced', async () => {
  const { json: before } = await get('/api/spaces');
  const limit = before.limit;
  if (limit === null) return; // unlimited in this build (no plan/MAX_SPACES) — nothing to enforce

  // Fill up to the limit; the default space already counts toward it.
  const created = [];
  while (before.spaces.length + created.length < limit) {
    const r = await post('/api/spaces', { name: `Limit ${created.length}` });
    assert.equal(r.status, 201);
    created.push(r.json.id);
  }
  // Total spaces now equals the limit — one more must be refused.
  assert.equal((await post('/api/spaces', { name: 'One too many' })).status, 403);

  for (const id of created) await del(`/api/spaces/${id}`);
});

// ── extension smoke (only when extensions/ is linked; deep coverage lives in
//    the private repo's own suites) ────────────────────────────────────────────

const extMaybe = (name, fn) => test(name, { skip: ready && hasExtensions ? false : 'extensions/ not linked' }, fn);

extMaybe('extensions smoke: billing catalog is served and admin API is token-gated', async () => {
  const { status, json } = await get('/api/billing/plans');
  assert.equal(status, 200);
  assert.equal(json.plans.length, 4);
  assert.equal((await get('/api/admin/overview')).status, 401);
});

extMaybe('extensions smoke: AI write-mode capture tracks usage for the local account', async () => {
  await post('/api/learn', { mode: 'write', title: 'Usage Ping', body: '# U', category: 'Testing', summary: '', tags: [] });
  const { json } = await get('/api/billing/subscription');
  assert.equal(json.plan.id, 'thread');
  assert.equal(typeof json.usage.aiUsedThisMonth, 'number');
});
