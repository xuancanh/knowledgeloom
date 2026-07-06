/**
 * Share links — publish a note + its study deck at an unguessable URL.
 *
 * Authenticated (owner) routes:
 *   POST   /api/shares        { noteId } → { id, url }
 *   GET    /api/shares        → active shares for the user
 *   DELETE /api/shares/:id    → revoke
 *
 * Public route (NO auth — anyone with the link):
 *   GET /api/shares/:id/public → { note, flashcards, quiz }
 *
 * The public payload is read-only and self-contained: note content plus its
 * generated cards, no vault ids, links, or account information.
 */
import {
  Controller, Get, Post, Delete, Body, Param, HttpCode, UseGuards,
  NotFoundException, BadRequestException,
} from '@nestjs/common';
import { SharesRepository } from './shares.repository';
import { NoteFileRepository } from '../notes/note-file.repository';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { parseNote, stripFrontmatter } from '../common/note-parser.util';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WritableGuard } from '../common/guards/writable.guard';
import { basename } from 'node:path';

@Controller('api/shares')
@UseGuards(ApiAuthGuard)
export class SharesController {
  constructor(
    private readonly shares: SharesRepository,
    private readonly noteRepo: NoteFileRepository,
  ) {}

  @Post()
  @UseGuards(WritableGuard)
  async create(@CurrentUser() userId: string, @Body() body: { noteId?: string }) {
    const noteId = basename(String(body?.noteId || '').trim());
    if (!noteId) throw new BadRequestException('noteId is required');
    const file = await this.noteRepo.findById(userId, noteId);
    if (!file) throw new NotFoundException('note not found');
    const share = await this.shares.create(userId, noteId);
    return { id: share.id, url: `/share/${share.id}`, noteId };
  }

  @Get()
  async list(@CurrentUser() userId: string) {
    return { shares: await this.shares.listByUser(userId) };
  }

  @Delete(':id')
  @HttpCode(200)
  async revoke(@CurrentUser() userId: string, @Param('id') id: string) {
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
    private readonly noteRepo: NoteFileRepository,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  @Get(':id/public')
  async read(@Param('id') id: string) {
    const share = await this.shares.findActive(basename(id));
    if (!share) throw new NotFoundException('share not found');

    let markdown: string;
    try {
      markdown = await this.noteRepo.readMarkdown(share.userId, share.noteId);
    } catch {
      throw new NotFoundException('shared note no longer exists');
    }
    const note = parseNote(`${share.noteId}.md`, markdown);

    // Cards come from the owner's enriched state; strip review data and ids
    // down to study content only.
    const state = await this.knowledgeService.getState(share.userId);
    const flashcards = (state.flashcards || [])
      .filter((c: any) => c.noteId === share.noteId)
      .map((c: any) => ({ prompt: c.prompt, lesson: c.lesson, kind: c.kind }));
    const quiz = (state.quizQuestions || [])
      .filter((q: any) => q.noteId === share.noteId)
      .map((q: any) => ({
        type: q.type,
        question: q.question,
        answer: q.answer,
        choices: q.choices,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
      }));

    return {
      note: {
        title: note.title,
        category: note.category,
        summary: note.summary,
        tags: note.tags,
        body: stripFrontmatter(markdown),
        createdAt: note.createdAt,
      },
      flashcards,
      quiz,
      sharedAt: share.createdAt,
    };
  }
}
