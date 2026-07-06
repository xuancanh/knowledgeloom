/**
 * RagController — streaming RAG endpoint.
 *
 * POST /api/rag/stream
 *   Body: { question, scope, history }
 *   Response: text/plain chunked stream of AI tokens
 *
 * The client reads the response body as a ReadableStream and appends tokens
 * to the chat message as they arrive.
 *
 * Requires authentication — RAG is scoped to the authenticated user's notes.
 */
import { Controller, Post, Body, Res, UseGuards, Inject } from '@nestjs/common';
import type { Response } from 'express';
import { RagService, RagRequest } from './rag.service';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentScope } from '../auth/current-scope.decorator';
import { WritableGuard } from '../common/guards/writable.guard';
import { USAGE_SERVICE, UsageService } from '../usage/usage.interface';

@Controller('api/rag')
@UseGuards(ApiAuthGuard)
export class RagController {
  constructor(
    private readonly ragService: RagService,
    @Inject(USAGE_SERVICE) private readonly usage: UsageService,
  ) {}

  @Post('stream')
  @UseGuards(WritableGuard)
  async stream(
    @CurrentScope() userId: string,
    @Body() body: RagRequest,
    @Res() res: Response,
  ): Promise<void> {
    // Quota check before headers are flushed so over-quota users get a clean 429.
    await this.usage.checkQuota(userId, 'ai.rag');
    await this.usage.track(userId, 'ai.rag');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.flushHeaders();

    try {
      for await (const token of this.ragService.stream(userId, body)) {
        res.write(token);
      }
    } catch (err: any) {
      res.write(`\n\n[Error: ${err?.message || 'Unknown error'}]`);
    } finally {
      res.end();
    }
  }
}
