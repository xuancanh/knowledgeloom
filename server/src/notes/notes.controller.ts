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
import { Controller, Get, Put, Patch, Delete, Post, Param, Body, HttpCode, UseGuards, BadRequestException } from '@nestjs/common';
import { NotesService } from './notes.service';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WritableGuard } from '../common/guards/writable.guard';

@Controller('api/notes')
@UseGuards(SupabaseAuthGuard)
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

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
  async assistDraft(@Body() body: any) {
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) throw new BadRequestException('prompt is required');
    return this.notesService.assistDraft(body?.draft || {}, prompt);
  }

  @Post(':id/assist')
  @UseGuards(WritableGuard)
  async assist(@Param('id') id: string, @Body() body: any) {
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) throw new BadRequestException('prompt is required');
    return this.notesService.assistEdit(id, body?.draft || {}, prompt);
  }

  @Post(':id/regenerate')
  @HttpCode(200)
  @UseGuards(WritableGuard)
  async regenerate(
    @CurrentUser() userId: string,
    @Param('id') id: string,
    @Body() body: { target?: string },
  ) {
    const target = body?.target === 'quiz' ? 'quiz' : body?.target === 'flashcards' ? 'flashcards' : 'all';
    await this.notesService.regenerate(userId, id, target);
    return { regenerated: id, target };
  }
}
