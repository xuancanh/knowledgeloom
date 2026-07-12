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
import { limitMarketplacePreview } from './share-payload-limit.util';

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

/** Public payloads are cached briefly — building a collection reads up to 50
 *  note files, and the endpoint is unauthenticated. 30s staleness is fine for
 *  read-only share pages. */
const PAYLOAD_TTL_MS = 30_000;
const PAYLOAD_CACHE_MAX = 200;

@Injectable()
export class SharePayloadService {
  private readonly cache = new Map<string, { at: number; payload: SharePayload }>();

  constructor(
    private readonly noteRepo: NoteFileRepository,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  async build(share: Pick<ShareRow, 'userId' | 'noteId' | 'kind' | 'createdAt'>): Promise<SharePayload> {
    const key = `${share.userId}|${share.kind}|${share.noteId}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < PAYLOAD_TTL_MS) return hit.payload;

    const payload = share.kind === 'category' ? await this.buildCategory(share) : await this.buildNote(share);
    this.cache.set(key, { at: Date.now(), payload });
    if (this.cache.size > PAYLOAD_CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    return payload;
  }

  async buildPreview(share: Pick<ShareRow, 'userId' | 'noteId' | 'kind' | 'createdAt'>): Promise<SharePayload> {
    return limitMarketplacePreview(await this.build(share));
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
