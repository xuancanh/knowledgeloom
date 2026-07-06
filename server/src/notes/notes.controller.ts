/**
 * NotesController — individual note read/write operations.
 *
 * Routes:
 *   GET    /api/notes/:id          — raw markdown for the editor
 *   PUT    /api/notes/:id          — full note update (editor save)
 *   PATCH  /api/notes/:id          — partial note update (same handler as PUT)
 *   DELETE /api/notes/:id          — delete note and rebuild indexes
 *   POST   /api/notes/assist-draft — AI edit proposal for an unsaved draft
 *   POST   /api/notes/:id/assist   — AI edit proposal (does not write to disk)
 *
 * All routes require authentication. Write routes also require writable mode.
 */
import { Controller, Get, Put, Patch, Delete, Post, Param, Body, HttpCode, UseGuards, BadRequestException, Inject } from '@nestjs/common';
import { NotesService } from './notes.service';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WritableGuard } from '../common/guards/writable.guard';
import { USAGE_SERVICE, UsageService } from '../usage/usage.interface';

@Controller('api/notes')
@UseGuards(ApiAuthGuard)
export class NotesController {
  constructor(
    private readonly notesService: NotesService,
    @Inject(USAGE_SERVICE) private readonly usage: UsageService,
  ) {}

  @Post('backfill-bilinks')
  @HttpCode(200)
  @UseGuards(WritableGuard)
  backfillBilinks(@CurrentUser() userId: string) {
    return this.notesService.backfillBilinks(userId);
  }

  @Get(':id')
  async getMarkdown(@CurrentUser() userId: string, @Param('id') id: string) {
    return { markdown: await this.notesService.getMarkdown(userId, id) };
  }

  @Put(':id')
  @UseGuards(WritableGuard)
  update(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: any) {
    return this.notesService.update(userId, id, body || {});
  }

  @Patch(':id')
  @UseGuards(WritableGuard)
  patch(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: any) {
    return this.notesService.update(userId, id, body || {});
  }

  @Delete(':id')
  @UseGuards(WritableGuard)
  delete(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.notesService.delete(userId, id);
  }

  @Post('assist-draft')
  @UseGuards(WritableGuard)
  async assistDraft(@CurrentUser() userId: string, @Body() body: any) {
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) throw new BadRequestException('prompt is required');
    await this.usage.checkQuota(userId, 'ai.assist');
    await this.usage.track(userId, 'ai.assist');
    // CodexService resolves note context from draft.userId — without it,
    // link suggestions had no vault to check against.
    return this.notesService.assistDraft({ ...(body?.draft || {}), userId }, prompt);
  }

  @Post(':id/assist')
  @UseGuards(WritableGuard)
  async assist(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: any) {
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) throw new BadRequestException('prompt is required');
    await this.usage.checkQuota(userId, 'ai.assist');
    await this.usage.track(userId, 'ai.assist', { noteId: id });
    // draft.userId is how CodexService locates the note being edited; the
    // endpoint 404'd for every real user without it.
    return this.notesService.assistEdit(id, { ...(body?.draft || {}), userId }, prompt);
  }

  @Post(':id/read')
  @HttpCode(200)
  async markRead(@CurrentUser() userId: string, @Param('id') id: string) {
    await this.notesService.markRead(userId, id);
    return { ok: true };
  }

  @Post(':id/regenerate')
  @HttpCode(200)
  @UseGuards(WritableGuard)
  async regenerate(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: { target?: string; size?: string },
  ) {
    const target = body?.target === 'quiz' ? 'quiz' : body?.target === 'flashcards' ? 'flashcards' : 'all';
    const size = body?.size === 'medium' ? 'medium' : body?.size === 'large' ? 'large' : 'small';
    await this.usage.checkQuota(userId, 'ai.regenerate');
    await this.usage.track(userId, 'ai.regenerate', { noteId: id, target });
    const job = await this.notesService.enqueueRegenerate(userId, id, target, size);
    return { job };
  }
}
