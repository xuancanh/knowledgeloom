/**
 * S3NoteStorage — NoteStorageProvider backed by any S3-compatible object store.
 *
 * Compatible backends:
 *  - Cloudflare R2 (zero egress fees, ideal for self-hosted cloud deployment)
 *  - AWS S3 (standard)
 *  - MinIO (self-hosted)
 *  - Tigris, Backblaze B2, Wasabi, etc.
 *
 * Uses the AWS SDK v3 (modular) because it supports custom endpoints via the
 * `endpoint` option, which is required for R2 and other S3-compatible stores.
 * Only the three commands needed (ListObjectsV2, GetObject, PutObject, DeleteObject)
 * are imported to keep the bundle size small.
 *
 * Notes are stored as markdown objects keyed as:
 *   `${prefix}${relativePath}` (e.g. `notes/Engineering/my-note.md`)
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
 *   S3_PREFIX           — key prefix, default: notes/
 */
import { Injectable } from '@nestjs/common';
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
  private readonly prefix: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('s3Bucket');
    this.prefix = config.get<string>('s3Prefix') || 'notes/';

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

  async ensureStore(): Promise<void> {
    // S3/R2 buckets are created outside the app (via Wrangler, AWS console, etc.)
    // Nothing to initialise — the bucket must already exist.
  }

  async listFiles(): Promise<string[]> {
    const files: string[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: this.prefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of result.Contents || []) {
        const key = obj.Key || '';
        const relative = key.slice(this.prefix.length);
        if (relative && relative.endsWith('.md')) {
          files.push(relative);
        }
      }

      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken);

    return files.sort();
  }

  async read(relativePath: string): Promise<string> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: this.key(relativePath) }),
    );
    // The Body is a ReadableStream in Node 18+ / AWS SDK v3.
    return result.Body!.transformToString('utf-8');
  }

  async write(relativePath: string, content: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(relativePath),
        Body: content,
        ContentType: 'text/markdown; charset=utf-8',
      }),
    );
  }

  async move(fromRelative: string, toRelative: string, content: string): Promise<void> {
    const toKey = this.key(toRelative);
    // S3 does not have a native rename; check existence, write, then delete.
    if (await this.exists(toRelative)) {
      const err: any = new Error(`cannot move ${fromRelative}; ${toRelative} already exists`);
      err.status = 409;
      throw err;
    }
    await this.write(toRelative, content);
    await this.delete(fromRelative);
  }

  async delete(relativePath: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(relativePath) }),
    ).catch(() => {
      // Silently ignore missing-object errors (matches local rm --force).
    });
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.key(relativePath) }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private key(relativePath: string): string {
    return `${this.prefix}${relativePath}`;
  }
}
