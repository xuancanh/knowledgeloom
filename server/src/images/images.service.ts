/**
 * Stores uploaded images on the local filesystem under knowledge/images/
 * and serves them back by filename.
 *
 * Public API: save() writes a buffer to disk; resolve() looks up a file.
 * Path traversal is prevented via basename() sanitization.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

@Injectable()
export class ImagesService {
  private readonly imagesDir: string;

  constructor(config: ConfigService) {
    this.imagesDir = join(config.get<string>('knowledgeDir'), 'images');
  }

  async save(file: { originalname: string; buffer: Buffer; mimetype: string }): Promise<{ url: string; filename: string }> {
    await mkdir(this.imagesDir, { recursive: true });

    const ext = extname(file.originalname).toLowerCase() || '.bin';
    const slug = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-').toLowerCase();
    const filename = `${Date.now()}-${slug}`;
    const dest = join(this.imagesDir, filename);

    await writeFile(dest, file.buffer);

    return { url: `/api/images/${filename}`, filename };
  }

  async resolve(name: string): Promise<{ path: string | null; mimeType: string }> {
    const safe = basename(name);
    const path = join(this.imagesDir, safe);
    try {
      await access(path);
      const ext = extname(safe).toLowerCase();
      return { path, mimeType: MIME_MAP[ext] || 'application/octet-stream' };
    } catch {
      return { path: null, mimeType: 'application/octet-stream' };
    }
  }
}
