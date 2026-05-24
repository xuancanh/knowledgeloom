/**
 * S3NoteStorage — NoteStorageProvider backed by any S3-compatible object store.
 *
 * Compatible backends:
 *  - Cloudflare R2 (zero egress fees, ideal for self-hosted cloud deployment)
 *  - AWS S3 (standard)
 *  - MinIO (self-hosted)
 *  - Tigris, Backblaze B2, Wasabi, etc.
 *
 * Notes are stored as markdown objects keyed as:
 *   `users/{userId}/notes/{relativePath}` (e.g. `users/abc123/notes/Engineering/my-note.md`)
 *
 * The `listFiles()` implementation pages through ListObjectsV2 results so it
 * works correctly on buckets with more than 1000 objects.
 *
 * Enabled when NOTE_STORAGE=s3.
 *
 * Required env vars:
 *   S3_ENDPOINT         — e.g. https://<id>.r2.cloudflarestorage.com
 *   S3_BUCKET           — bucket name
 *   S3_ACCESS_KEY_ID    — access key (R2: API token)
 *   S3_SECRET_ACCESS_KEY — secret key
 *
 * Optional:
 *   S3_REGION           — default: auto (correct for R2)
 */
import { Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import type { NoteStorageProvider } from './note-storage.interface';

@Injectable()
export class S3NoteStorage implements NoteStorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('s3Bucket');

    this.client = new S3Client({
      endpoint: config.get<string>('s3Endpoint'),
      region: config.get<string>('s3Region') || 'auto',
      credentials: {
        accessKeyId: config.get<string>('s3AccessKeyId'),
        secretAccessKey: config.get<string>('s3SecretAccessKey'),
      },
      // Required for R2 and other non-AWS endpoints.
      forcePathStyle: false,
    });
  }

  private userPrefix(userId: string): string {
    return `users/${userId}/notes/`;
  }

  /**
   * Security: verify the S3 key belongs to the given user.
   */
  private assertUserKey(userId: string, key: string): void {
    const expectedPrefix = this.userPrefix(userId);
    if (!key.startsWith(expectedPrefix)) {
      throw new ForbiddenException('S3 key does not belong to user namespace');
    }
  }

  async ensureStore(_userId: string): Promise<void> {
    // S3/R2 buckets are created outside the app (via Wrangler, AWS console, etc.)
    // Nothing to initialise — the bucket must already exist.
  }

  async listFiles(userId: string): Promise<string[]> {
    const prefix = this.userPrefix(userId);
    const files: string[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of result.Contents || []) {
        const key = obj.Key || '';
        const relative = key.slice(prefix.length);
        if (relative && relative.endsWith('.md')) {
          files.push(relative);
        }
      }

      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    return files.sort();
  }

  async read(userId: string, relativePath: string): Promise<string> {
    const key = this.key(userId, relativePath);
    this.assertUserKey(userId, key);
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return result.Body!.transformToString('utf-8');
  }

  async write(userId: string, relativePath: string, content: string): Promise<void> {
    const key = this.key(userId, relativePath);
    this.assertUserKey(userId, key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: content,
        ContentType: 'text/markdown; charset=utf-8',
      }),
    );
  }

  async move(userId: string, fromRelative: string, toRelative: string, content: string): Promise<void> {
    const fromKey = this.key(userId, fromRelative);
    const toKey = this.key(userId, toRelative);
    this.assertUserKey(userId, fromKey);
    this.assertUserKey(userId, toKey);
    // S3 does not have a native rename; check existence, write, then delete.
    if (await this.exists(userId, toRelative)) {
      const err: any = new Error(`cannot move ${fromRelative}; ${toRelative} already exists`);
      err.status = 409;
      throw err;
    }
    await this.write(userId, toRelative, content);
    await this.delete(userId, fromRelative);
  }

  async delete(userId: string, relativePath: string): Promise<void> {
    const key = this.key(userId, relativePath);
    this.assertUserKey(userId, key);
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    ).catch(() => {
      // Silently ignore missing-object errors (matches local rm --force).
    });
  }

  async exists(userId: string, relativePath: string): Promise<boolean> {
    const key = this.key(userId, relativePath);
    this.assertUserKey(userId, key);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private key(userId: string, relativePath: string): string {
    return `${this.userPrefix(userId)}${relativePath}`;
  }
}
