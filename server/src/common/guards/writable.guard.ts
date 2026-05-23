/**
 * WritableGuard — rejects mutation requests in read-only deployments.
 *
 * Apply with `@UseGuards(WritableGuard)` on any controller method that writes
 * to disk, the database, or Meilisearch. The guard reads the `readOnly` config
 * key which is set to `true` when any of these env vars is `1`:
 *   KNOWLEDGE_READ_ONLY, READ_ONLY_MODE, CF_PAGES, WORKERS_CI
 *
 * Returns HTTP 403 with `{ error: 'service is running in read-only mode' }`.
 */
import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WritableGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(_ctx: ExecutionContext): boolean {
    if (this.config.get<boolean>('readOnly')) {
      throw new ForbiddenException('service is running in read-only mode');
    }
    return true;
  }
}
