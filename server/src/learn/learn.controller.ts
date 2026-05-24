/**
 * LearnController — note capture endpoint.
 *
 * POST /api/learn accepts four modes:
 *
 *  - write    — synchronous direct write; user provides the full body.
 *               Does not invoke Codex. Records a completed job for the activity rail.
 *
 *  - research — async Codex job; AI researches the topic and writes a note.
 *
 *  - polish   — async Codex job; AI polishes the user-authored body without
 *               adding new claims.
 *
 *  - link     — async Codex job; AI retrieves the URL and writes a note from it.
 *
 * Write mode is synchronous because it does not depend on Codex and the user
 * expects immediate feedback. The other modes return 202 Accepted with a job id
 * the client can poll via GET /api/jobs/:id.
 *
 * All routes require authentication.
 */
import { Controller, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { NotesService } from '../notes/notes.service';
import { JobsService } from '../jobs/jobs.service';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WritableGuard } from '../common/guards/writable.guard';

@Controller('api/learn')
@UseGuards(SupabaseAuthGuard)
export class LearnController {
  constructor(
    private readonly notesService: NotesService,
    private readonly jobsService: JobsService,
  ) {}

  @Post()
  @UseGuards(WritableGuard)
  async learn(@CurrentUser() userId: string, @Body() body: any) {
    const b = body || {};
    const mode = ['write', 'polish', 'research', 'link'].includes(b.mode) ? b.mode : 'research';
    const topic = typeof b.title === 'string' ? b.title.trim() : typeof b.topic === 'string' ? b.topic.trim() : '';
    const draftBody = typeof b.body === 'string' ? b.body.trim() : '';
    const url = typeof b.url === 'string' ? b.url.trim() : '';

    if (!topic && mode !== 'link') throw new BadRequestException('title is required');

    if (mode === 'link') {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error();
      } catch {
        throw new BadRequestException('valid http(s) url is required for link mode');
      }
    }

    // Direct write: synchronous, no Codex.
    if (mode === 'write') {
      if (!draftBody) throw new BadRequestException('body is required for direct notes');
      const result = await this.notesService.createFromDraft(userId, { ...b, title: topic, body: draftBody });
      const job = await this.jobsService.recordCompleted(userId, { ...b, mode, topic, title: topic }, result);
      return { jobId: job.id, job, ...result };
    }

    if (mode === 'polish' && !draftBody) {
      throw new BadRequestException('body is required for polish mode');
    }

    const job = await this.jobsService.enqueue(userId, {
      ...b,
      mode,
      topic: topic || url,
      title: topic || url,
      body: draftBody,
      url,
    });
    return { jobId: job.id, job };
  }
}
