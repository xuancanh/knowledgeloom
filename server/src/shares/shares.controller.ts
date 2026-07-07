/**
 * Share links — publish a note or a whole category (collection) plus its
 * study deck at an unguessable URL.
 *
 * Authenticated (owner) routes:
 *   POST   /api/shares        { noteId } | { category } → { id, url, kind }
 *   GET    /api/shares        → active shares for the user
 *   DELETE /api/shares/:id    → revoke
 *
 * Public route (NO auth — anyone with the link):
 *   GET /api/shares/:id/public
 *     kind='note'     → { kind, note, flashcards, quiz }
 *     kind='category' → { kind, collection, notes, flashcards, quiz }
 *
 * Public payloads are read-only and self-contained: content plus generated
 * cards, no vault link ids or account information.
 */
import {
  Controller, Get, Post, Delete, Body, Param, HttpCode, UseGuards,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import { SharesRepository } from './shares.repository';
import { SharePayloadService } from './share-payload.service';
import { NoteFileRepository } from '../notes/note-file.repository';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentScope } from '../auth/current-scope.decorator';
import { WritableGuard } from '../common/guards/writable.guard';
import { CreateShareDto } from './shares.dto';
import { basename } from 'node:path';

@Controller('api/shares')
@UseGuards(ApiAuthGuard)
export class SharesController {
  constructor(
    private readonly shares: SharesRepository,
    private readonly noteRepo: NoteFileRepository,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  @Post()
  @UseGuards(WritableGuard)
  async create(@CurrentScope() userId: string, @Body() body: CreateShareDto) {
    const category = typeof body?.category === 'string' ? body.category.trim() : '';

    if (category) {
      const state = await this.knowledgeService.getState(userId);
      const hasNotes = state.notes.some(
        (n) => n.category === category || n.category.startsWith(`${category}/`),
      );
      if (!hasNotes) throw new NotFoundException('category has no notes');
      const share = await this.shares.create(userId, category, 'category');
      return { id: share.id, url: `/share/${share.id}`, kind: 'category', target: category };
    }

    const noteId = basename(String(body?.noteId || '').trim());
    if (!noteId) throw new BadRequestException('noteId or category is required');
    const file = await this.noteRepo.findById(userId, noteId);
    if (!file) throw new NotFoundException('note not found');
    const share = await this.shares.create(userId, noteId, 'note');
    return { id: share.id, url: `/share/${share.id}`, kind: 'note', target: noteId };
  }

  @Get()
  async list(@CurrentScope() userId: string) {
    return { shares: await this.shares.listByUser(userId) };
  }

  @Delete(':id')
  @HttpCode(200)
  async revoke(@CurrentScope() userId: string, @Param('id') id: string) {
    const revoked = await this.shares.revoke(userId, id);
    if (!revoked) throw new NotFoundException('share not found');
    return { revoked: id };
  }
}

/**
 * Public share reader — deliberately NOT behind ApiAuthGuard. Access control
 * is the 128-bit share id itself; revoked or dangling shares 404.
 */
@Controller('api/shares')
export class PublicSharesController {
  constructor(
    private readonly shares: SharesRepository,
    private readonly payloads: SharePayloadService,
  ) {}

  @Get(':id/public')
  async read(@Param('id') id: string) {
    const share = await this.shares.findActive(basename(id));
    if (!share) throw new NotFoundException('share not found');
    return this.payloads.build(share);
  }
}
