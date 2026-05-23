import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { MEILI_HOST, MEILI_INDEX, MEILI_MASTER_KEY, meiliSyncPath, READ_ONLY_MODE, rootDir } from './config.mjs';

/**
 * Builds Meilisearch request headers from local config.
 */
function meiliHeaders() {
  return {
    'content-type': 'application/json',
    ...(MEILI_MASTER_KEY ? { Authorization: `Bearer ${MEILI_MASTER_KEY}` } : {}),
  };
}

/**
 * Thin fetch wrapper that turns non-2xx Meilisearch responses into useful
 * errors for fallback search and startup logs.
 */
async function meiliRequest(pathname, options = {}) {
  const response = await fetch(`${MEILI_HOST}${pathname}`, {
    ...options,
    headers: { ...meiliHeaders(), ...(options.headers || {}) },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meilisearch ${response.status}: ${text}`);
  }
  return response.json();
}

/**
 * Reads the last successful sync manifest. The manifest lets us determine
 * changed and removed documents without deleting/re-adding the whole index.
 */
async function loadSyncManifest() {
  if (!existsSync(meiliSyncPath)) return { documents: {} };
  try {
    return JSON.parse(await readFile(meiliSyncPath, 'utf8'));
  } catch {
    return { documents: {} };
  }
}

/**
 * Reads remote document ids when no local sync manifest exists yet.
 * This lets the first incremental sync clean up stale docs from older versions
 * of the app that used full-index replacement without a manifest.
 */
async function loadRemoteManifest() {
  const result = await meiliRequest(`/indexes/${MEILI_INDEX}/documents?limit=10000&fields=id`);
  const documents = {};
  for (const document of result.results || []) {
    if (document.id) documents[document.id] = 'remote';
  }
  return { documents };
}

/**
 * Persists the hashes of documents that are known to be present in Meilisearch.
 */
async function saveSyncManifest(documents) {
  if (READ_ONLY_MODE) return;
  await writeFile(meiliSyncPath, JSON.stringify({
    documents,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

/**
 * Stable hash used to detect whether a Meilisearch document needs updating.
 */
function hashDocument(document) {
  return createHash('sha256').update(JSON.stringify(document)).digest('hex');
}

/**
 * Builds one Meilisearch document from note metadata and markdown body.
 */
async function buildDocument(note) {
  const markdown = await readFile(path.join(rootDir, note.path), 'utf8');
  return { ...note, body: markdown.replace(/^---[\s\S]*?---\s*/, '') };
}

/**
 * Removes one document from Meilisearch and from the local sync manifest.
 *
 * `syncMeilisearch()` also deletes stale ids during a full rebuild, but note
 * deletion calls this directly so the removed article is cleaned from search
 * even when the manifest is missing, stale, or the following rebuild has no
 * changed documents to send.
 */
export async function deleteMeilisearchDocument(id) {
  if (READ_ONLY_MODE || !id) return { deleted: 0 };

  await meiliRequest(`/indexes/${MEILI_INDEX}/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }).catch((error) => {
    if (!error.message.includes('index_not_found') && !error.message.includes('document_not_found')) throw error;
  });

  const manifest = await loadSyncManifest();
  if (manifest.documents?.[id]) {
    const nextDocuments = { ...manifest.documents };
    delete nextDocuments[id];
    await saveSyncManifest(nextDocuments);
  }
  return { deleted: 1 };
}

/**
 * Incrementally syncs Meilisearch documents rebuilt from markdown.
 *
 * The app treats markdown as canonical. We track hashes of the last successful
 * sync and only send changed documents plus delete requests for removed ids.
 */
export async function syncMeilisearch(state) {
  if (READ_ONLY_MODE) return { mode: 'read-only', addedOrUpdated: 0, deleted: 0 };

  await meiliRequest('/indexes', {
    method: 'POST',
    body: JSON.stringify({ uid: MEILI_INDEX, primaryKey: 'id' }),
  }).catch((error) => {
    if (!error.message.includes('index_already_exists')) throw error;
  });

  await meiliRequest(`/indexes/${MEILI_INDEX}/settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      searchableAttributes: ['title', 'summary', 'category', 'tags', 'body'],
      filterableAttributes: ['category', 'tags'],
      sortableAttributes: ['createdAt', 'title'],
      displayedAttributes: ['id', 'title', 'summary', 'category', 'tags', 'links', 'createdAt', 'path'],
    }),
  });

  const documents = await Promise.all(state.notes.map(buildDocument));
  let manifest = await loadSyncManifest();
  if (!Object.keys(manifest.documents || {}).length) {
    manifest = await loadRemoteManifest().catch(() => manifest);
  }
  const nextManifest = {};
  const changed = [];

  for (const document of documents) {
    const hash = hashDocument(document);
    nextManifest[document.id] = hash;
    if (manifest.documents?.[document.id] !== hash) {
      changed.push(document);
    }
  }

  const currentIds = new Set(documents.map((document) => document.id));
  const deletedIds = Object.keys(manifest.documents || {}).filter((id) => !currentIds.has(id));

  if (changed.length) {
    await meiliRequest(`/indexes/${MEILI_INDEX}/documents`, {
      method: 'PUT',
      body: JSON.stringify(changed),
    });
  }

  await Promise.all(deletedIds.map((id) => meiliRequest(`/indexes/${MEILI_INDEX}/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })));

  await saveSyncManifest(nextManifest);
  return { mode: 'incremental', addedOrUpdated: changed.length, deleted: deletedIds.length };
}

/**
 * Executes a Meilisearch query for the UI search overlay.
 */
export async function searchMeilisearch(query, category) {
  const filter = category && category !== 'All' ? `category = "${category.replace(/"/g, '\\"')}"` : undefined;
  const result = await meiliRequest(`/indexes/${MEILI_INDEX}/search`, {
    method: 'POST',
    body: JSON.stringify({
      q: query || '',
      limit: 50,
      filter,
      attributesToHighlight: ['title', 'summary', 'body'],
    }),
  });
  return result.hits || [];
}
