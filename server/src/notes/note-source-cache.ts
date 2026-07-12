import type { KnowledgeNote } from '../types';

export type CachedNoteSource = {
  version: string;
  markdown: string;
  note: KnowledgeNote;
};

type CacheEntry = CachedNoteSource & { bytes: number; scope: string; path: string };

/** Bounded process-local LRU for parsed markdown sources. Storage remains authoritative. */
export class NoteSourceCache {
  private readonly entries = new Map<string, CacheEntry>();
  private totalBytes = 0;

  constructor(private readonly maxBytes: number) {}

  get(scope: string, path: string, version: string): CachedNoteSource | null {
    const key = this.key(scope, path);
    const entry = this.entries.get(key);
    if (!entry || entry.version !== version) return null;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  set(scope: string, path: string, source: CachedNoteSource): void {
    if (this.maxBytes <= 0) return;
    const key = this.key(scope, path);
    const previous = this.entries.get(key);
    if (previous) this.totalBytes -= previous.bytes;
    const entry: CacheEntry = {
      ...source,
      scope,
      path,
      bytes: Buffer.byteLength(source.markdown, 'utf8'),
    };
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.totalBytes += entry.bytes;
    this.evict();
  }

  retain(scope: string, paths: Set<string>): void {
    for (const [key, entry] of this.entries) {
      if (entry.scope === scope && !paths.has(entry.path)) this.remove(key, entry);
    }
  }

  invalidate(scope: string, path?: string): void {
    if (path !== undefined) {
      const key = this.key(scope, path);
      const entry = this.entries.get(key);
      if (entry) this.remove(key, entry);
      return;
    }
    for (const [key, entry] of this.entries) {
      if (entry.scope === scope) this.remove(key, entry);
    }
  }

  private evict(): void {
    while (this.totalBytes > this.maxBytes && this.entries.size) {
      const oldestKey = this.entries.keys().next().value as string;
      this.remove(oldestKey, this.entries.get(oldestKey)!);
    }
  }

  private remove(key: string, entry: CacheEntry): void {
    this.entries.delete(key);
    this.totalBytes -= entry.bytes;
  }

  private key(scope: string, path: string): string {
    return `${scope}\0${path}`;
  }
}
