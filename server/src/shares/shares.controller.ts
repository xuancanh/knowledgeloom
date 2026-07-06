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
import { NoteFileRepository } from '../notes/note-file.repository';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { parseNote, stripFrontmatter } from '../common/note-parser.util';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WritableGuard } from '../common/guards/writable.guard';
import { basename } from 'node:path';

/** Category shares include at most this many notes, newest first. */
const COLLECTION_NOTE_CAP = 50;

const slimCard = (c: any) => ({ prompt: c.prompt, lesson: c.lesson, kind: c.kind, noteTitle: c.noteTitle });
const slimQuiz = (q: any) => ({
  type: q.type,
  question: q.question,
  answer: q.answer,
  choices: q.choices,
  correctIndex: q.correctIndex,
  explanation: q.explanation,
  noteTitle: q.noteTitle,
});

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
  async create(@CurrentUser() userId: string, @Body() body: { noteId?: string; category?: string }) {
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
    return share.kind === 'category' ? this.readCategory(share) : this.readNote(share);
  }

  private async readNote(share: { userId: string; noteId: string; createdAt: string }) {
    let markdown: string;
    try {
      markdown = await this.noteRepo.readMarkdown(share.userId, share.noteId);
    } catch {
      throw new NotFoundException('shared note no longer exists');
    }
    const note = parseNote(`${share.noteId}.md`, markdown);
    const state = await this.knowledgeService.getState(share.userId);

    return {
      kind: 'note' as const,
      note: {
        title: note.title,
        category: note.category,
        summary: note.summary,
        tags: note.tags,
        body: stripFrontmatter(markdown),
        createdAt: note.createdAt,
      },
      flashcards: (state.flashcards || []).filter((c: any) => c.noteId === share.noteId).map(slimCard),
      quiz: (state.quizQuestions || []).filter((q: any) => q.noteId === share.noteId).map(slimQuiz),
      sharedAt: share.createdAt,
    };
  }

  private async readCategory(share: { userId: string; noteId: string; createdAt: string }) {
    const category = share.noteId; // target column holds the category path
    const state = await this.knowledgeService.getState(share.userId);
    const inCategory = (c: string) => c === category || c.startsWith(`${category}/`);
    const notes = state.notes
      .filter((n) => inCategory(n.category))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, COLLECTION_NOTE_CAP);
    if (!notes.length) throw new NotFoundException('shared collection no longer exists');

    const noteIds = new Set(notes.map((n) => n.id));
    const fullNotes = await Promise.all(
      notes.map(async (n) => {
        let body = '';
        try {
          body = stripFrontmatter(await this.noteRepo.readMarkdown(share.userId, n.id));
        } catch { /* skip body when unreadable */ }
        return { title: n.title, category: n.category, summary: n.summary, tags: n.tags, body, createdAt: n.createdAt };
      }),
    );

    return {
      kind: 'category' as const,
      collection: { name: category, noteCount: fullNotes.length },
      notes: fullNotes,
      flashcards: (state.flashcards || []).filter((c: any) => noteIds.has(c.noteId)).map(slimCard),
      quiz: (state.quizQuestions || []).filter((q: any) => noteIds.has(q.noteId)).map(slimQuiz),
      sharedAt: share.createdAt,
    };
  }
}
