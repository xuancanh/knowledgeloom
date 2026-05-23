# Storage Module — Spec

**Location**: `server/src/storage/`  
**NestJS module**: `StorageModule`  
**Injection token**: `NOTE_STORAGE` (string constant in `note-storage.interface.ts`)

---

## Purpose

Pluggable note file persistence. The active backend is selected via `NOTE_STORAGE`.
All code that reads or writes markdown files injects `NoteStorageProvider` rather
than calling `fs` or the AWS SDK directly.

---

## Interface

```typescript
interface NoteStorageProvider {
  listFiles(): Promise<string[]>;        // relative paths, sorted, *.md only
  read(relativePath: string): Promise<string>;
  write(relativePath: string, content: string): Promise<void>;
  move(from: string, to: string, content: string): Promise<void>;
  delete(relativePath: string): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  ensureStore(): Promise<void>;
}
```

`listFiles()` returns paths relative to the notes root (e.g.
`Engineering/Backend/2024-01-15-drizzle-orm.md`), sorted alphabetically, ending
in `.md`. This contract must be preserved by any new implementation.

---

## Implementations

### LocalNoteStorage (`NOTE_STORAGE=local`, default)

Reads and writes files under `knowledge/notes/` using `node:fs/promises`.

- `ensureStore()` creates `notes/`, `categories/`, and a stub `index.json` if absent.
- `listFiles()` recursively walks the directory tree, skipping hidden files
  (names starting with `.`).
- `write()` creates parent directories with `mkdir({ recursive: true })`.
- `move()` checks for destination existence before writing; throws HTTP 409 if
  the target already exists. Writes the new file, then deletes the old one.
- `delete()` uses `rm({ force: true })` (silent if missing).

### S3NoteStorage (`NOTE_STORAGE=s3`)

Reads and writes objects in any S3-compatible bucket using AWS SDK v3.

Compatible backends: Cloudflare R2, AWS S3, MinIO, Tigris, Backblaze B2.

**Required env vars**
| Env var | Description |
|---------|-------------|
| `S3_ENDPOINT` | e.g. `https://<id>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | Bucket name |
| `S3_ACCESS_KEY_ID` | Access key (R2: API token id) |
| `S3_SECRET_ACCESS_KEY` | Secret key |

**Optional**
| Env var | Default | Description |
|---------|---------|-------------|
| `S3_REGION` | `auto` | Region (R2 uses `auto`) |
| `S3_PREFIX` | `notes/` | Key prefix prepended to all relative paths |

**Implementation notes**:
- `listFiles()` paginates with `ListObjectsV2Command` (handles > 1000 objects).
- `move()` is implemented as `exists()` check → `write()` new key → `delete()` old key.
  S3 has no native rename.
- `ensureStore()` is a no-op; the bucket must be created externally (Wrangler, AWS
  console, etc.).
- `delete()` ignores errors for missing objects to match `rm --force` semantics.

---

## Module wiring

`StorageModule` uses a factory provider:

```typescript
{
  provide: NOTE_STORAGE,
  inject: [ConfigService],
  useFactory: (config) => {
    const backend = config.get('noteStorage') || 'local';
    if (backend === 's3') return new S3NoteStorage(config);
    return new LocalNoteStorage(config);
  },
}
```

`StorageModule` is imported by `NotesFileModule` and `SearchModule`.

---

## Adding a new storage backend

1. Create `your-storage.ts` implementing `NoteStorageProvider`.
   Pay attention to the `listFiles()` contract (relative paths, sorted, `.md` only).
2. Add a branch to the factory in `storage.module.ts`.
3. Document the new `NOTE_STORAGE` value in `AGENTS.md`.
