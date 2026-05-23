/**
 * StatusController — lightweight health/capability endpoint.
 *
 * GET /api/status returns the readOnly flag so the frontend can disable write
 * actions when the server is deployed in a read-only cloud environment (e.g.
 * Cloudflare Pages where markdown cannot be written to disk).
 */
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('api/status')
export class StatusController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  getStatus() {
    return { readOnly: this.config.get<boolean>('readOnly') };
  }
}
