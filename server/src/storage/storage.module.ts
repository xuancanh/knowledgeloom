/**
 * StorageModule — selects and provides the active NoteStorageProvider.
 *
 * The NOTE_STORAGE environment variable controls which backend is used:
 *
 *   NOTE_STORAGE=local   (default) — Local filesystem under knowledge/notes/
 *   NOTE_STORAGE=s3      — Any S3-compatible object store (Cloudflare R2,
 *                          AWS S3, MinIO, Tigris, etc.)
 *
 * Switching providers requires only an env change and a server restart. All
 * services that read/write notes inject NoteStorageProvider via the
 * NOTE_STORAGE token and are unaware of the backing implementation.
 *
 * @example .env — Cloudflare R2
 *   NOTE_STORAGE=s3
 *   S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
 *   S3_BUCKET=knowledge-loom
 *   S3_REGION=auto
 *   S3_ACCESS_KEY_ID=...
 *   S3_SECRET_ACCESS_KEY=...
 *   S3_PREFIX=notes/
 *
 * @example .env — AWS S3
 *   NOTE_STORAGE=s3
 *   S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
 *   S3_BUCKET=my-knowledge-bucket
 *   S3_REGION=us-east-1
 *   S3_ACCESS_KEY_ID=AKIA...
 *   S3_SECRET_ACCESS_KEY=...
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LocalNoteStorage } from './local-note-storage';
import { S3NoteStorage } from './s3-note-storage';
import { NOTE_STORAGE } from './note-storage.interface';

const noteStorageFactory = {
  provide: NOTE_STORAGE,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const backend = config.get<string>('noteStorage') || 'local';
    if (backend === 's3') {
      return new S3NoteStorage(config);
    }
    return new LocalNoteStorage(config);
  },
};

@Module({
  providers: [noteStorageFactory, LocalNoteStorage, S3NoteStorage],
  exports: [NOTE_STORAGE],
})
export class StorageModule {}
