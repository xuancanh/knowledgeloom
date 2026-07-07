/**
 * KnowledgeController — serves the full knowledge graph snapshot.
 *
 * GET /api/knowledge is called on every page load — and polled every few
 * seconds — to hydrate the frontend with notes, categories, flashcards, and the
 * link graph. It rebuilds derived state from the markdown source so the frontend
 * always reflects the latest disk state even when notes are edited outside the app.
 *
 * The payload is large, so the response carries a weak ETag over the serialized
 * state and honours If-None-Match: an unchanged poll gets a tiny 304 instead of
 * re-sending (and re-parsing) the whole graph.
 *
 * Requires authentication — results are scoped to the authenticated user.
 */
import { Controller, Get, UseGuards, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { KnowledgeService } from './knowledge.service';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentScope } from '../auth/current-scope.decorator';

@Controller('api/knowledge')
@UseGuards(ApiAuthGuard)
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get()
  async getKnowledge(@CurrentScope() userId: string, @Req() req: Request, @Res() res: Response) {
    const state = await this.knowledgeService.getState(userId);
    const body = JSON.stringify(state);
    const etag = `W/"${createHash('sha1').update(body).digest('base64')}"`;

    // no-cache = the browser may store it but must revalidate; combined with the
    // ETag this turns a repeat poll into a conditional request.
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('ETag', etag);

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(body);
  }
}
