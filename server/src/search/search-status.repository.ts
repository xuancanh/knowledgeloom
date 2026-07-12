import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { SearchStatus } from '../types';

@Injectable()
export class SearchStatusRepository {
  private readonly usersDir: string;

  constructor(config: ConfigService) {
    this.usersDir = config.get<string>('usersDir');
  }

  async get(userId: string, engine: string): Promise<SearchStatus> {
    try {
      const parsed = JSON.parse(await readFile(this.path(userId), 'utf8')) as Partial<SearchStatus>;
      if (parsed.state !== 'healthy' && parsed.state !== 'degraded') throw new Error('invalid status');
      if (parsed.engine !== engine) throw new Error('search engine changed');
      return {
        engine,
        state: parsed.state,
        lastAttemptAt: typeof parsed.lastAttemptAt === 'string' ? parsed.lastAttemptAt : null,
        lastSuccessAt: typeof parsed.lastSuccessAt === 'string' ? parsed.lastSuccessAt : null,
        error: typeof parsed.error === 'string' ? parsed.error : null,
      };
    } catch {
      return { engine, state: 'unknown', lastAttemptAt: null, lastSuccessAt: null, error: null };
    }
  }

  async save(userId: string, status: SearchStatus): Promise<void> {
    const target = this.path(userId);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(temporary, JSON.stringify(status, null, 2));
    await rename(temporary, target);
  }

  private path(userId: string): string {
    return join(this.usersDir, userId, 'search-status.json');
  }
}
