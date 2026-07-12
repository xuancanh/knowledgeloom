/**
 * Server-mode integration tests — boots the compiled server in the two
 * non-default configurations and verifies their behavioural contracts:
 *
 *   AUTH_SECRET set        → every API call requires the bearer token
 *   KNOWLEDGE_READ_ONLY=1  → reads work, writes are rejected
 *
 * Each mode gets its own server on its own port with KNOWLEDGE_ROOT pointed
 * at a temp dir. Requires server/dist + redis (BullMQ) like `npm run dev`.
 *
 * Run: npm run test:integration
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

function redisUp() {
  return new Promise((resolve) => {
    const sock = createConnection({ host: 'localhost', port: 6379 });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
    sock.setTimeout(1000, () => { sock.destroy(); resolve(false); });
  });
}

const ready = existsSync(ENTRY) && await redisUp();
const servers = [];

function bootFailure(extraEnv) {
  return new Promise((resolve, reject) => {
    const tmp = mkdtempSync(join(tmpdir(), 'kl-modes-fail-'));
    const proc = spawn('node', [ENTRY], {
      cwd: tmp,
      env: {
        ...process.env,
        PORT: String(9401 + (process.pid % 40)),
        KNOWLEDGE_ROOT: tmp,
        SEARCH_PROVIDER: 'inmemory',
        SKIP_JOBS: '1',
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    proc.stdout.on('data', (chunk) => { output += chunk; });
    proc.stderr.on('data', (chunk) => { output += chunk; });
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      rmSync(tmp, { recursive: true, force: true });
      reject(new Error('server did not fail startup within 10 seconds'));
    }, 10_000);
    proc.once('exit', (code) => {
      clearTimeout(timer);
      rmSync(tmp, { recursive: true, force: true });
      resolve({ code, output });
    });
  });
}

async function bootServer(port, extraEnv) {
  const tmp = mkdtempSync(join(tmpdir(), 'kl-modes-'));
  const proc = spawn('node', [ENTRY], {
    cwd: tmp,
    env: {
      ...process.env,
      PORT: String(port),
      KNOWLEDGE_ROOT: tmp,
      REDIS_DB: '12', // integration-ai owns 15 (and flushes it) — stay clear
      SEARCH_PROVIDER: 'inmemory',
      CODEX_COMMAND: 'false',
      EXT_SEED_DEMO: '0',
      EXT_QUOTA_PREFIX: `modes:${process.pid}:${port}`,
      ...extraEnv,
    },
    stdio: 'ignore',
  });
  servers.push({ proc, tmp });
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/api/status`)).status < 500) return `http://localhost:${port}`;
    } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not boot on :${port}`);
}

test.after(() => {
  for (const s of servers) {
    s.proc.kill('SIGKILL');
    rmSync(s.tmp, { recursive: true, force: true });
  }
});

const maybe = (name, fn) => test(name, { skip: ready ? false : 'needs server/dist build + local redis' }, fn);

test('production refuses unauthenticated local auth without an explicit opt-in', {
  skip: existsSync(ENTRY) ? false : 'needs server/dist build',
}, async () => {
  const result = await bootFailure({
    NODE_ENV: 'production',
    AUTH_PROVIDER: '',
    AUTH_SECRET: '',
    ALLOW_UNAUTHENTICATED_LOCAL: '',
  });
  assert.notEqual(result.code, 0);
  assert.match(result.output, /Refusing to start production with unauthenticated local auth/);
});

maybe('AUTH_SECRET mode: API requires the bearer token', async () => {
  const base = await bootServer(9241 + (process.pid % 40), { AUTH_SECRET: 'modes-secret' });

  assert.equal((await fetch(`${base}/api/knowledge`)).status, 401, 'no token → 401');
  assert.equal((await fetch(`${base}/api/knowledge`, {
    headers: { Authorization: 'Bearer wrong-secret' },
  })).status, 401, 'wrong token → 401');

  const ok = await fetch(`${base}/api/knowledge`, { headers: { Authorization: 'Bearer modes-secret' } });
  assert.equal(ok.status, 200, 'correct token → 200');

  // writes carry through the same auth
  const write = await fetch(`${base}/api/learn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer modes-secret' },
    body: JSON.stringify({ mode: 'write', title: 'Authed', body: '# A', category: 'T', summary: '', tags: [] }),
  });
  assert.ok(write.ok);
  const created = await write.json();

  // Share management requires auth, but the public share URL must stay open:
  // the whole point of a share link is that the recipient has no account.
  assert.equal((await fetch(`${base}/api/shares`, { method: 'POST' })).status, 401);
  const share = await (await fetch(`${base}/api/shares`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: 'Bearer modes-secret' },
    body: JSON.stringify({ noteId: created.note.id }),
  })).json();
  const pub = await fetch(`${base}/api/shares/${share.id}/public`);
  assert.equal(pub.status, 200, 'public share readable without the bearer token');
});

maybe('audio import without transcription config → 501 with a clear message', async () => {
  const base = await bootServer(9321 + (process.pid % 40), {});
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(2048)], { type: 'audio/mpeg' }), 'lecture.mp3');
  const res = await fetch(`${base}/api/import`, { method: 'POST', body: form });
  assert.equal(res.status, 501);
  const json = await res.json();
  assert.match(json.error, /transcription is not configured/);

  // TTS is likewise dark without a key: config says so, endpoint 501s.
  const cfg = await (await fetch(`${base}/api/tts/config`)).json();
  assert.equal(cfg.enabled, false);
  const tts = await fetch(`${base}/api/tts/podcast`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lines: [{ who: 'maya', text: 'hello' }] }),
  });
  assert.equal(tts.status, 501);

  // Image import is dark too (codex CLI provider has no vision endpoint).
  const imgForm = new FormData();
  imgForm.append('file', new Blob([new Uint8Array(256)], { type: 'image/png' }), 'photo.png');
  const img = await fetch(`${base}/api/import`, { method: 'POST', body: imgForm });
  assert.equal(img.status, 501);
  assert.match((await img.json()).error, /image import is not configured/);
});

maybe('public endpoints: security headers set, per-IP rate limit enforced', async () => {
  const base = await bootServer(9361 + (process.pid % 40), {
    PUBLIC_RATE_LIMIT: '5',
    PUBLIC_RATE_LIMIT_PREFIX: `modes:${process.pid}:memory:`,
  });

  const res = await fetch(`${base}/api/status`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');

  // Authenticated/API routes are never limited…
  for (let i = 0; i < 10; i++) assert.equal((await fetch(`${base}/api/status`)).status, 200);

  // …but public marketplace browsing hits the window after PUBLIC_RATE_LIMIT.
  let limited = 0;
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${base}/api/marketplace`);
    if (r.status === 429) limited++;
  }
  assert.ok(limited >= 4, `expected 429s after the limit, got ${limited}`);
});

maybe('public endpoints: Redis allowance is shared across server replicas', async () => {
  const prefix = `modes:${process.pid}:shared:`;
  const env = { PUBLIC_RATE_LIMIT: '5', PUBLIC_RATE_LIMIT_STORE: 'redis', PUBLIC_RATE_LIMIT_PREFIX: prefix };
  const baseA = await bootServer(9371 + (process.pid % 20), env);
  const baseB = await bootServer(9391 + (process.pid % 20), env);
  const responses = [];
  for (let i = 0; i < 3; i++) {
    responses.push(await fetch(`${baseA}/api/marketplace`));
    responses.push(await fetch(`${baseB}/api/marketplace`));
  }
  assert.deepEqual(responses.map((r) => r.status), [200, 200, 200, 200, 200, 429]);
  assert.ok(Number(responses[5].headers.get('retry-after')) > 0);
});

maybe('read-only mode: reads succeed, writes are rejected', async () => {
  const base = await bootServer(9281 + (process.pid % 40), { KNOWLEDGE_READ_ONLY: '1' });

  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.readOnly, true);
  assert.equal((await fetch(`${base}/api/knowledge`)).status, 200, 'reads still work');

  const write = await fetch(`${base}/api/learn`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'write', title: 'Nope', body: '# N', category: 'T', summary: '', tags: [] }),
  });
  assert.equal(write.status, 403, 'writes are forbidden');
  const body = await write.json();
  assert.match(body.error, /read-only/i);
});
