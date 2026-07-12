import test from 'node:test';
import assert from 'node:assert/strict';
import {
  limitMarketplacePreview,
  MARKETPLACE_PREVIEW_MAX_BYTES,
} from '../server/src/shares/share-payload-limit.util';

const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');

test('marketplace preview leaves small category payloads unchanged', () => {
  const payload = {
    kind: 'category' as const,
    collection: { name: 'Testing', noteCount: 1 },
    notes: [{ title: 'Small', body: 'content' }],
    flashcards: [],
    quiz: [],
    sharedAt: '2026-01-01T00:00:00.000Z',
  };
  assert.equal(limitMarketplacePreview(payload), payload);
});

test('marketplace preview caps large category responses without mutating imports', () => {
  const hugeBody = 'Knowledge 🧠 '.repeat(120_000);
  const payload = {
    kind: 'category' as const,
    collection: { name: 'Large', noteCount: 3 },
    notes: [1, 2, 3].map((n) => ({ title: `Note ${n}`, body: hugeBody })),
    flashcards: Array.from({ length: 100 }, (_, n) => ({ prompt: `Prompt ${n}`, lesson: hugeBody })),
    quiz: Array.from({ length: 100 }, (_, n) => ({ question: `Question ${n}`, answer: hugeBody })),
    sharedAt: '2026-01-01T00:00:00.000Z',
  };

  const preview = limitMarketplacePreview(payload);
  assert.ok(bytes(preview) <= MARKETPLACE_PREVIEW_MAX_BYTES);
  assert.equal(preview.collection.truncated, true);
  assert.equal(preview.collection.includedNoteCount, preview.notes.length);
  assert.ok(preview.notes.some((note) => note.bodyTruncated === true));
  assert.equal(payload.notes[0].body, hugeBody);
});
