import { createServer } from 'node:http';
import { spawn, ChildProcess } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const noteRootDir = path.join(rootDir, 'knowledge', 'notes');
const noteDir = path.join(noteRootDir, 'Testing');
const notePath = path.join(noteDir, '2099-01-01-smoke-meili.md');
const legacyNotePath = path.join(noteRootDir, '2099-01-01-smoke-meili.md');
const smokeManifestPath = path.join(rootDir, 'knowledge', 'meili-sync-knowledge_smoke.json');
const calls: Array<{ method: string; url: string; body: string }> = [];
let app: ChildProcess | undefined;
let fakeMeiliStarted = false;

// Fake Meili records requests so the test can assert that the backend tries to
// sync real note documents without depending on an external Meili instance.
const fakeMeili = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  calls.push({
    method: request.method as string,
    url: request.url as string,
    body: Buffer.concat(chunks).toString('utf8'),
  });
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ taskUid: calls.length, hits: [] }));
});

// Create a temporary markdown note, then let the backend rebuild from source.
await mkdir(noteDir, { recursive: true });
await writeFile(notePath, `---
title: "Smoke Meili"
category: "Testing"
summary: "Verifies source rebuild updates Meilisearch."
tags: ["smoke", "meili"]
links: []
createdAt: "2099-01-01T00:00:00.000Z"
---

# Smoke Meili

## What I learned
The backend updates Meilisearch when the markdown source is rebuilt.
`);

await new Promise<void>((resolve) => fakeMeili.listen(7799, resolve));
fakeMeiliStarted = true;

app = spawn('node', ['node_modules/.bin/ts-node', '--project', 'server/tsconfig.json', 'server/src/main.ts'], {
  cwd: rootDir,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    PORT: '8790',
    KNOWLEDGE_SKIP_DOTENV: '1',
    MEILI_HOST: 'http://127.0.0.1:7799',
    MEILI_MASTER_KEY: 'test_key',
    MEILI_INDEX: 'knowledge_smoke',
    AI_FLASHCARDS_DISABLED: '1',
    SKIP_JOBS: '1',
  },
});

/**
 * Waits for the temporary backend to boot and return a rebuilt manifest.
 */
const waitForApi = async (): Promise<unknown> => {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch('http://127.0.0.1:8790/api/knowledge');
      if (response.ok) return response.json();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('API did not start');
};

/**
 * Fire-and-forget fetch used during cleanup when a dev server may or may not
 * be running.
 */
async function fetchIfAvailable(url: string): Promise<void> {
  try {
    await fetch(url);
  } catch {
    // Best-effort cleanup: the target server may not be running in this test mode.
  }
}

/**
 * Removes temporary smoke data and asks any running backend to rebuild derived
 * state so the smoke document does not remain in Meilisearch.
 */
async function cleanup(): Promise<void> {
  await rm(notePath, { force: true });
  await rm(legacyNotePath, { force: true });

  // Rebuild derived indexes after deleting the temporary note. The 8790 server
  // is the test app using fake Meili; 8787 is a dev server if one is running.
  await fetchIfAvailable('http://127.0.0.1:8790/api/knowledge');
  await fetchIfAvailable('http://localhost:8787/api/knowledge');
  await rm(smokeManifestPath, { force: true });

  if (app && !app.killed) app.kill('SIGTERM');
  if (fakeMeiliStarted) {
    await new Promise<void>((resolve) => fakeMeili.close(() => resolve()));
  }
}

try {
  const state = await waitForApi() as { notes: Array<{ id: string }> };
  const syncedDocs = calls
    .filter((call) => call.method === 'PUT' && call.url === '/indexes/knowledge_smoke/documents')
    .map((call) => JSON.parse(call.body) as Array<{ id: string; category: string }>);
  const flattened = syncedDocs.flat();
  const hasSmokeDoc = flattened.some((doc) => doc.id === '2099-01-01-smoke-meili' && doc.category === 'Testing');
  if (!state.notes.some((note) => note.id === '2099-01-01-smoke-meili')) {
    throw new Error('Knowledge manifest did not include smoke note');
  }
  if (!hasSmokeDoc) {
    throw new Error('Meilisearch document sync did not include smoke note');
  }

  const putCountAfterFirstSync = syncedDocs.length;
  await fetch('http://127.0.0.1:8790/api/knowledge');
  const putCountAfterSecondSync = calls.filter((call) => call.method === 'PUT' && call.url === '/indexes/knowledge_smoke/documents').length;
  const fullDeletes = calls.filter((call) => call.method === 'DELETE' && call.url === '/indexes/knowledge_smoke/documents');
  if (putCountAfterSecondSync !== putCountAfterFirstSync) {
    throw new Error('Incremental sync updated unchanged documents');
  }
  if (fullDeletes.length) {
    throw new Error('Incremental sync used full document deletion');
  }

  await rm(notePath, { force: true });
  await rm(legacyNotePath, { force: true });
  await fetch('http://127.0.0.1:8790/api/knowledge');
  const deletedSmokeDoc = calls.some((call) => (
    call.method === 'DELETE'
    && call.url === '/indexes/knowledge_smoke/documents/2099-01-01-smoke-meili'
  ));
  if (!deletedSmokeDoc) {
    throw new Error('Meilisearch document cleanup did not delete the removed smoke note');
  }
  console.log('meili-sync-smoke-ok');
} finally {
  await cleanup();
}
