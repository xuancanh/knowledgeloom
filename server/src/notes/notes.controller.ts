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
 * Write routes are guarded by WritableGuard. The assist routes also require
 * writable mode since they invoke CodexService.
 */
import { Controller, Get, Put, Patch, Delete, Post, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { NotesService } from './notes.service';
import { WritableGuard } from '../common/guards/writable.guard';

@Controller('api/notes')
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get(':id')
  async getMarkdown(@Param('id') id: string) {
    return { markdown: await this.notesService.getMarkdown(id) };
  }

  @Put(':id')
  @UseGuards(WritableGuard)
  update(@Param('id') id: string, @Body() body: any) {
    return this.notesService.update(id, body || {});
  }

  @Patch(':id')
  @UseGuards(WritableGuard)
  patch(@Param('id') id: string, @Body() body: any) {
    return this.notesService.update(id, body || {});
  }

  @Delete(':id')
  @UseGuards(WritableGuard)
  delete(@Param('id') id: string) {
    return this.notesService.delete(id);
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
}
