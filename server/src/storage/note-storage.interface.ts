/**
 * NoteStorageProvider — abstract interface for note file persistence.
 *
 * Decouples the application from any specific storage backend. Services that
 * read and write markdown files depend only on this interface so the underlying
 * implementation can be swapped without touching business logic.
 *
 * Two implementations ship out of the box:
 *
 *  - LocalNoteStorage   — reads and writes files on the local filesystem.
 *                         The default for development and self-hosted setups.
 *
 *  - S3NoteStorage      — reads and writes objects in any S3-compatible bucket.
 *                         Compatible with Cloudflare R2, AWS S3, MinIO, etc.
 *                         Suitable for cloud-hosted or serverless deployments.
 *
 * The active implementation is selected by the NOTE_STORAGE env variable.
 *
 * @example .env
 *   # Use Cloudflare R2
 *   NOTE_STORAGE=s3
 *   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
 *   S3_BUCKET=knowledge-notes
 *   S3_REGION=auto
 *   S3_ACCESS_KEY_ID=...
 *   S3_SECRET_ACCESS_KEY=...
 *   S3_PREFIX=notes/          # optional key prefix
 */

export interface NoteStorageProvider {
  /**
   * Returns all relative paths (e.g. `Engineering/note-id.md`) in the notes
   * store, sorted alphabetically. Used by KnowledgeService to rebuild indexes.
   */
  listFiles(): Promise<string[]>;

  /**
   * Reads the raw markdown content of a file by its relative path.
   * Throws if the file does not exist.
   */
  read(relativePath: string): Promise<string>;

  /**
   * Writes (creates or overwrites) a file at the given relative path.
   */
  write(relativePath: string, content: string): Promise<void>;

  /**
   * Moves a file from one relative path to another.
   * Throws if the destination already exists.
   */
  move(fromRelative: string, toRelative: string, content: string): Promise<void>;

  /**
   * Deletes a file. A missing file is silently ignored.
   */
  delete(relativePath: string): Promise<void>;

  /**
   * Returns true if a file with the given relative path exists.
   */
  exists(relativePath: string): Promise<boolean>;

  /**
   * Ensures the backing store is initialised (creates root folders, etc.).
   * Called once at startup; subsequent calls are no-ops.
   */
  ensureStore(): Promise<void>;
}

/** Injection token for the NoteStorageProvider. */
export const NOTE_STORAGE = 'NOTE_STORAGE';
