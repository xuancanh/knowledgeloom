import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRestoreBundle, RestoreService } from '../server/src/export/restore.service';

const bundle = (notes: Array<{ file: string; markdown: string }>) => JSON.stringify({
  format: 'knowledge-loom-export/v1',
  notes,
  settings: { theme: 'dark' },
});

test('restore parser accepts the portable export format', () => {
  const parsed = parseRestoreBundle(bundle([{ file: 'Engineering/note.md', markdown: '# Note' }]));
  assert.equal(parsed.notes[0].file, 'Engineering/note.md');
  assert.deepEqual(parsed.settings, { theme: 'dark' });
});

test('restore parser rejects traversal, duplicate, and unsupported bundles', () => {
  assert.throws(() => parseRestoreBundle(bundle([{ file: '../escape.md', markdown: '# No' }])), /relative \.md path|unsafe file path/);
  assert.throws(() => parseRestoreBundle(bundle([
    { file: 'same.md', markdown: '# One' },
    { file: 'same.md', markdown: '# Two' },
  ])), /duplicate file path/);
  assert.throws(() => parseRestoreBundle(JSON.stringify({ format: 'other/v1', notes: [] })), /unsupported backup format/);
});

test('restore dry-run reports conflicts without writing and rename is deterministic', async () => {
  const writes: Array<{ file: string; markdown: string }> = [];
  let rebuilds = 0;
  const service = new RestoreService(
    {
      listFiles: async () => ['same.md', 'same-restored.md'],
      write: async (_userId: string, file: string, markdown: string) => { writes.push({ file, markdown }); },
    } as never,
    { patch: async () => ({}) } as never,
    { rebuildIndexes: async () => { rebuilds += 1; return {}; } } as never,
  );
  const parsed = parseRestoreBundle(bundle([
    { file: 'same.md', markdown: '# Conflict' },
    { file: 'new.md', markdown: '# New' },
  ]));

  const preview = await service.restore('local', parsed, { policy: 'rename', dryRun: true, restoreSettings: false });
  assert.deepEqual(preview.conflicts, ['same.md']);
  assert.equal(preview.renamed, 1);
  assert.equal(preview.created, 1);
  assert.equal(writes.length, 0);

  await service.restore('local', parsed, { policy: 'rename', dryRun: false, restoreSettings: false });
  assert.deepEqual(writes.map((write) => write.file), ['same-restored-2.md', 'new.md']);
  assert.equal(rebuilds, 1, 'the full batch rebuilds derived state once');
});
