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
import { Controller, Post, Body, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { RagService, RagRequest } from './rag.service';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WritableGuard } from '../common/guards/writable.guard';

@Controller('api/rag')
@UseGuards(ApiAuthGuard)
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('stream')
  @UseGuards(WritableGuard)
  async stream(
    @CurrentUser() userId: string,
    @Body() body: RagRequest,
    @Res() res: Response,
  ): Promise<void> {
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
