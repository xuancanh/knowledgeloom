/**
 * SharePayloadService — builds the public, self-contained payload for a share
 * (note or category). Used by the public share reader and the marketplace
 * (listing detail + vault import).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { NoteFileRepository } from '../notes/note-file.repository';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { parseNote, stripFrontmatter } from '../common/note-parser.util';
import type { ShareRow } from './shares.repository';

/** Category shares include at most this many notes, newest first. */
const COLLECTION_NOTE_CAP = 50;

export interface SharedNotePayload {
  title: string;
  category: string;
  summary: string;
  tags: string[];
  body: string;
  createdAt: string;
}

export interface SharePayload {
  kind: 'note' | 'category';
  note?: SharedNotePayload;
  collection?: { name: string; noteCount: number };
  notes?: SharedNotePayload[];
  flashcards: any[];
  quiz: any[];
  sharedAt: string;
}

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

@Injectable()
export class SharePayloadService {
  constructor(
    private readonly noteRepo: NoteFileRepository,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async build(share: Pick<ShareRow, 'userId' | 'noteId' | 'kind' | 'createdAt'>): Promise<SharePayload> {
    return share.kind === 'category' ? this.buildCategory(share) : this.buildNote(share);
  }

  private async buildNote(share: Pick<ShareRow, 'userId' | 'noteId' | 'createdAt'>): Promise<SharePayload> {
    let markdown: string;
    try {
      markdown = await this.noteRepo.readMarkdown(share.userId, share.noteId);
    } catch {
      throw new NotFoundException('shared note no longer exists');
    }
    const note = parseNote(`${share.noteId}.md`, markdown);
    const state = await this.knowledgeService.getState(share.userId);

    return {
      kind: 'note',
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

  private async buildCategory(share: Pick<ShareRow, 'userId' | 'noteId' | 'createdAt'>): Promise<SharePayload> {
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
      kind: 'category',
      collection: { name: category, noteCount: fullNotes.length },
      notes: fullNotes,
      flashcards: (state.flashcards || []).filter((c: any) => noteIds.has(c.noteId)).map(slimCard),
      quiz: (state.quizQuestions || []).filter((q: any) => noteIds.has(q.noteId)).map(slimQuiz),
      sharedAt: share.createdAt,
    };
  }
}
