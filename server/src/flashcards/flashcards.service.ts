import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { AI_PROVIDER, AiProvider } from '../ai/ai-provider.interface';
import { FlashcardCacheRepository } from './flashcard-cache.repository';
import { FlashcardReviewsRepository, type FlashcardReview } from './flashcard-reviews.repository';
import { UserFlashcardsRepository, type UserFlashcardRow } from './user-flashcards.repository';
import { HiddenFlashcardsRepository } from './hidden-flashcards.repository';
import type { KnowledgeNote, NoteSource, Flashcard } from '../types';

export interface ReviewOutcome {
  easeFactor: string;
  interval: number;
  repetitions: number;
  nextReviewAt: string;
}

@Injectable()
export class FlashcardsService {
  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly cacheRepo: FlashcardCacheRepository,
    private readonly reviewsRepo: FlashcardReviewsRepository,
    private readonly userFlashcardsRepo: UserFlashcardsRepository,
    private readonly hiddenFlashcardsRepo: HiddenFlashcardsRepository,
    private readonly config: ConfigService,
  ) {}

  /**
   * SM-2 spaced repetition algorithm.
   * Rating mapping: again=1 (fail), hard=2 (barely), good=4 (perfect recall).
   */
  computeReview(rating: 'again' | 'hard' | 'good', current?: {
    easeFactor: string;
    interval: number;
    repetitions: number;
  }): ReviewOutcome {
    const q = rating === 'again' ? 1 : rating === 'hard' ? 2 : 4;
    const ef = current ? parseFloat(current.easeFactor) : 2.5;
    const rep = current?.repetitions ?? 0;
    const prevInterval = current?.interval ?? 0;

    let newEf = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (newEf < 1.3) newEf = 1.3;

    let newInterval: number;
    let newRep: number;

    if (q < 3) {
      newRep = 0;
      newInterval = 1;
    } else {
      newRep = rep + 1;
      if (newRep === 1) {
        newInterval = 1;
      } else if (newRep === 2) {
        newInterval = 6;
      } else {
        newInterval = Math.round(prevInterval * newEf);
      }
    }

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + newInterval);
    const nextReviewAt = nextReview.toISOString();

    return {
      easeFactor: newEf.toFixed(2),
      interval: newInterval,
      repetitions: newRep,
      nextReviewAt,
    };
  }

  async sync(noteSources: NoteSource[], { force = false } = {}): Promise<Flashcard[]> {
    const cache = await this.cacheRepo.load();
    const disabled = this.config.get<boolean>('aiFlashcardsDisabled');

    if (disabled) {
      const noteIds = new Set(noteSources.map(({ note }) => note.id));
      return Object.entries(cache)
        .filter(([noteId]) => noteIds.has(noteId))
        .flatMap(([, entry]) => entry.cards || []);
    }

    const nextNotes: Record<string, any> = {};

    for (const { note, markdown } of noteSources) {
      const hash = this.noteHash(note, markdown);
      const cached = cache[note.id];
      if (!force && cached?.hash === hash && Array.isArray(cached.cards)) {
        nextNotes[note.id] = cached;
        continue;
      }
      const prompt = this.buildPrompt(note, markdown);
      const output = await this.ai.complete(prompt, { outputFormat: 'json' });
      const cards = this.normalize(note, this.parseJson(output));
      nextNotes[note.id] = { hash, cards, generatedAt: new Date().toISOString() };
    }

    await this.cacheRepo.replace(nextNotes);
    return Object.values(nextNotes).flatMap((entry: any) => entry.cards || []);
  }

  /**
   * Loads user-created flashcards, hidden card IDs, and review data for the
   * knowledge state merge. Returns enriched flashcards with review metadata.
   */
  async loadEnrichedData(noteSources: NoteSource[]): Promise<{
    allCards: Flashcard[];
    reviews: Map<string, FlashcardReview>;
  }> {
    const noteIds = new Set(noteSources.map(({ note }) => note.id));
    const aiCards = await this.sync(noteSources);
    const userCards = await this.userFlashcardsRepo.loadAll();
    const hidden = await this.hiddenFlashcardsRepo.loadAll();
    const reviews = await this.reviewsRepo.loadAll();

    const noteMap = new Map(noteSources.map(({ note }) => [note.id, note]));

    const enrichedUserCards: Flashcard[] = userCards
      .filter((uc) => !hidden.has(uc.id))
      .map((uc) => {
        const note = noteMap.get(uc.noteId);
        return {
          id: uc.id,
          noteId: uc.noteId,
          noteTitle: note?.title ?? 'Unknown',
          category: note?.category ?? '',
          tags: note?.tags ?? [],
          prompt: uc.prompt,
          lesson: uc.lesson,
          kind: uc.kind as Flashcard['kind'],
        };
      });

    const enrichedAiCards = aiCards.filter((card) => !hidden.has(card.id));

    const allCards = [...enrichedUserCards, ...enrichedAiCards];
    return { allCards, reviews };
  }

  private noteHash(note: KnowledgeNote, markdown: string): string {
    return createHash('sha256')
      .update(JSON.stringify({ markdown, category: note.category, tags: note.tags, title: note.title, summary: note.summary }))
      .digest('hex');
  }

  private parseJson(output: string): any[] {
    const trimmed = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('AI did not return flashcard JSON');
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    if (!Array.isArray(parsed.flashcards)) throw new Error('AI flashcard JSON is missing flashcards array');
    return parsed.flashcards;
  }

  private normalize(note: KnowledgeNote, rawCards: any[]): Flashcard[] {
    const generic = new Set(['what i learned', 'key details', 'lesson', 'summary', 'key idea']);
    const allowedKinds = new Set(['concept', 'question', 'lesson', 'tradeoff', 'pattern']);
    return rawCards
      .map((card) => {
        const prompt = String(card.prompt || '').trim();
        const lesson = String(card.lesson || '').trim();
        const rawKind = String(card.kind || '').trim().toLowerCase();
        const kind = allowedKinds.has(rawKind) ? rawKind : 'lesson';
        return { prompt, lesson, kind };
      })
      .filter((card) => card.prompt.length >= 8 && card.lesson.length >= 30 && !generic.has(card.prompt.toLowerCase()))
      .slice(0, 8)
      .map((card): Flashcard => ({
        id: `${note.id}-${randomUUID()}`,
        noteId: note.id,
        noteTitle: note.title,
        category: note.category,
        tags: note.tags,
        prompt: card.prompt,
        lesson: card.lesson,
        kind: card.kind as Flashcard['kind'],
      }));
  }

  private buildPrompt(note: KnowledgeNote, markdown: string): string {
    return `Create high-signal flashcards from this knowledge note.

Rules:
- Return only valid JSON. No markdown fence and no commentary.
- Create 4 to 8 flashcards.
- Each flashcard must be a snippet or micro lesson from the note, not a generic section heading.
- The "prompt" must be specific to the card's idea. Never use generic titles like "What I learned", "Key details", "Lesson", or "Summary".
- The "lesson" should be 1 to 3 concise sentences, grounded only in the note.
- Prefer cards that help the user remember useful distinctions, tradeoffs, definitions, and practical implications.
- The "kind" must be exactly one of: "concept", "question", "lesson", "tradeoff", "pattern".
- Use a mix of kinds when the note supports it.

Note metadata:
${JSON.stringify({ id: note.id, title: note.title, category: note.category, tags: note.tags, summary: note.summary }, null, 2)}

Markdown:
${markdown}

Return this exact JSON shape:
{
  "flashcards": [
    { "prompt": "Specific card title", "lesson": "Micro lesson grounded in the note.", "kind": "concept" }
  ]
}
`;
  }
}
