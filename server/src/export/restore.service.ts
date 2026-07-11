import { Injectable } from '@nestjs/common';
import { posix } from 'node:path';
import { NoteFileRepository } from '../notes/note-file.repository';
import { UserSettingsRepository } from '../settings/user-settings.repository';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { ownerOf } from '../spaces/scope.util';
import { EXPORT_FORMAT } from './export.constants';

const MAX_NOTES = 10_000;
const MAX_NOTE_BYTES = 5 * 1024 * 1024;

export type RestoreConflictPolicy = 'skip' | 'overwrite' | 'rename';

interface ExportNote {
  file: string;
  markdown: string;
}

export interface ExportBundle {
  format: string;
  notes: ExportNote[];
  settings?: Record<string, unknown>;
}

export interface RestoreResult {
  dryRun: boolean;
  policy: RestoreConflictPolicy;
  total: number;
  created: number;
  overwritten: number;
  renamed: number;
  skipped: number;
  conflicts: string[];
  restoredSettings: boolean;
}

function invalid(message: string): never {
  const error = new Error(message) as Error & { status?: number };
  error.status = 400;
  throw error;
}

export function parseRestoreBundle(raw: string): ExportBundle {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { invalid('backup is not valid JSON'); }
  if (!value || typeof value !== 'object') invalid('backup must be a JSON object');
  const bundle = value as Partial<ExportBundle>;
  if (bundle.format !== EXPORT_FORMAT) invalid(`unsupported backup format; expected ${EXPORT_FORMAT}`);
  if (!Array.isArray(bundle.notes)) invalid('backup notes must be an array');
  if (bundle.notes.length > MAX_NOTES) invalid(`backup exceeds the ${MAX_NOTES}-note limit`);
  if (bundle.settings !== undefined && (!bundle.settings || typeof bundle.settings !== 'object' || Array.isArray(bundle.settings))) {
    invalid('backup settings must be an object');
  }

  const seen = new Set<string>();
  const notes = bundle.notes.map((entry, index) => {
    if (!entry || typeof entry !== 'object') invalid(`note ${index + 1} is invalid`);
    const file = (entry as ExportNote).file;
    const markdown = (entry as ExportNote).markdown;
    if (typeof file !== 'string' || !file || file.length > 500) invalid(`note ${index + 1} has an invalid file path`);
    if (file.includes('\\') || file.startsWith('/') || posix.normalize(file) !== file) {
      invalid(`note ${index + 1} has an unsafe file path`);
    }
    if (file.split('/').some((part) => !part || part === '.' || part === '..') || !file.endsWith('.md')) {
      invalid(`note ${index + 1} must use a relative .md path`);
    }
    if (seen.has(file)) invalid(`backup contains duplicate file path: ${file}`);
    seen.add(file);
    if (typeof markdown !== 'string') invalid(`note ${index + 1} markdown must be a string`);
    if (Buffer.byteLength(markdown, 'utf8') > MAX_NOTE_BYTES) invalid(`note ${file} exceeds the 5 MB limit`);
    return { file, markdown };
  });

  return { format: bundle.format, notes, settings: bundle.settings };
}

@Injectable()
export class RestoreService {
  constructor(
    private readonly notes: NoteFileRepository,
    private readonly settings: UserSettingsRepository,
    private readonly knowledge: KnowledgeService,
  ) {}

  async restore(userId: string, bundle: ExportBundle, options: {
    policy: RestoreConflictPolicy;
    dryRun: boolean;
    restoreSettings: boolean;
  }): Promise<RestoreResult> {
    const existing = new Set(await this.notes.listFiles(userId));
    const reserved = new Set(existing);
    const writes: Array<{ file: string; markdown: string; kind: 'created' | 'overwritten' | 'renamed' }> = [];
    const conflicts: string[] = [];
    let skipped = 0;

    for (const note of bundle.notes) {
      if (!existing.has(note.file)) {
        writes.push({ ...note, kind: 'created' });
        reserved.add(note.file);
        continue;
      }
      conflicts.push(note.file);
      if (options.policy === 'skip') {
        skipped += 1;
        continue;
      }
      if (options.policy === 'overwrite') {
        writes.push({ ...note, kind: 'overwritten' });
        continue;
      }
      const file = this.renamedPath(note.file, reserved);
      reserved.add(file);
      writes.push({ file, markdown: note.markdown, kind: 'renamed' });
    }

    if (!options.dryRun) {
      for (const write of writes) await this.notes.write(userId, write.file, write.markdown);
      if (options.restoreSettings && bundle.settings) await this.settings.patch(ownerOf(userId), bundle.settings);
      if (writes.length) await this.knowledge.rebuildIndexes(userId);
    }

    return {
      dryRun: options.dryRun,
      policy: options.policy,
      total: bundle.notes.length,
      created: writes.filter((write) => write.kind === 'created').length,
      overwritten: writes.filter((write) => write.kind === 'overwritten').length,
      renamed: writes.filter((write) => write.kind === 'renamed').length,
      skipped,
      conflicts,
      restoredSettings: !options.dryRun && options.restoreSettings && !!bundle.settings,
    };
  }

  private renamedPath(file: string, reserved: Set<string>): string {
    const stem = file.slice(0, -3);
    let suffix = 1;
    let candidate = `${stem}-restored.md`;
    while (reserved.has(candidate)) candidate = `${stem}-restored-${++suffix}.md`;
    return candidate;
  }
}
