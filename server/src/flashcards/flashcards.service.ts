import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { AI_PROVIDER, AiProvider } from '../ai/ai-provider.interface';
import { FlashcardCacheRepository } from './flashcard-cache.repository';
import { FlashcardReviewsRepository, type FlashcardReview } from './flashcard-reviews.repository';
import { UserFlashcardsRepository, type UserFlashcardRow } from './user-flashcards.repository';
import { HiddenFlashcardsRepository } from './hidden-flashcards.repository';
import type { GenSize, KnowledgeNote, NoteSource, Flashcard } from '../types';

const FC_SIZE_RANGE: Record<GenSize, { min: number; max: number; cap: number }> = {
  small:  { min: 5,  max: 10, cap: 10 },
  medium: { min: 10, max: 20, cap: 20 },
  large:  { min: 20, max: 40, cap: 40 },
};

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

  async sync(userId: string, noteSources: NoteSource[], { force = false, aiEnabled = true, size = 'small' as GenSize } = {}): Promise<Flashcard[]> {
    const cache = await this.cacheRepo.load(userId);
    const disabled = this.config.get<boolean>('aiFlashcardsDisabled') || !aiEnabled;

    if (disabled) {
      const noteIds = new Set(noteSources.map(({ note }) => note.id));
      return Object.entries(cache)
        .filter(([noteId]) => noteIds.has(noteId))
        .flatMap(([, entry]) => entry.cards || []);
    }

    const nextNotes: Record<string, any> = {};
    const uncached: NoteSource[] = [];

    for (const source of noteSources) {
      const { note, markdown } = source;
      const hash = this.noteHash(note, markdown);
      const cached = cache[note.id];
      if (!force && cached?.hash === hash && Array.isArray(cached.cards)) {
        nextNotes[note.id] = cached;
      } else {
        uncached.push(source);
      }
    }

    // Process uncached notes in parallel batches of 3
    const BATCH = 3;
    for (let i = 0; i < uncached.length; i += BATCH) {
      await Promise.all(
        uncached.slice(i, i + BATCH).map(async ({ note, markdown }) => {
          try {
            const prompt = this.buildPrompt(note, markdown, size);
            const output = await this.ai.complete(prompt, { outputFormat: 'json' });
            const cards = this.normalize(note, this.parseJson(output), size);
            nextNotes[note.id] = { hash: this.noteHash(note, markdown), cards, generatedAt: new Date().toISOString() };
          } catch (err) {
            // Keep existing cache entry on AI failure rather than losing cards
            if (cache[note.id]) nextNotes[note.id] = cache[note.id];
          }
        }),
      );
    }

    await this.cacheRepo.replace(userId, nextNotes);
    return Object.values(nextNotes).flatMap((entry: any) => entry.cards || []);
  }

  /**
   * Loads user-created flashcards, hidden card IDs, and review data for the
   * knowledge state merge. Returns enriched flashcards with review metadata.
   */
  async loadEnrichedData(userId: string, noteSources: NoteSource[]): Promise<{
    allCards: Flashcard[];
    reviews: Map<string, FlashcardReview>;
  }> {
    const noteIds = new Set(noteSources.map(({ note }) => note.id));
    const aiCards = await this.sync(userId, noteSources);
    const userCards = await this.userFlashcardsRepo.loadAll(userId);
    const hidden = await this.hiddenFlashcardsRepo.loadAll(userId);
    const reviews = await this.reviewsRepo.loadAll(userId);

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

  private normalize(note: KnowledgeNote, rawCards: any[], size: GenSize = 'small'): Flashcard[] {
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
      .slice(0, FC_SIZE_RANGE[size].cap)
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

  private buildPrompt(note: KnowledgeNote, markdown: string, size: GenSize = 'small'): string {
    const { min, max } = FC_SIZE_RANGE[size];
    return `You are generating spaced-repetition flashcards from a personal knowledge note.
Goal: cards that force genuine active recall — the reader must retrieve a specific fact, not just recognize a label.

━━ KINDS ━━
concept  — what a term, mechanism, or principle IS and how it works
question — when / why / how: a judgment call or causal chain
lesson   — a specific insight the author captured from experience or reading
tradeoff — an explicit tension between two approaches (X gains Y but costs Z)
pattern  — a reusable structure or technique and the problem it solves

━━ PROMPT: GOOD vs BAD ━━
✓ "What makes consistent hashing resilient to adding/removing nodes?"
✓ "When does optimistic locking beat pessimistic locking?"
✓ "What does the saga pattern give up compared to two-phase commit?"
✓ "Why does adding a B-tree index slow down writes?"
✓ "What heuristic did the author use to decide service boundaries?"
✗ "What I learned"       — no retrieval cue at all
✗ "Key idea"             — could be anything
✗ "Distributed systems"  — a topic, not a question
✗ "Main takeaway"        — generic non-prompt

━━ LESSON: GOOD vs BAD ━━
✓ "Consistent hashing places keys on a ring; adding a node only remaps adjacent keys, so reshuffling is O(k/n) instead of O(k)."
✓ "Optimistic locking avoids lock overhead by detecting conflicts at commit time. It wins when conflicts are rare but requires retry logic at the call site."
✓ "The author found that splitting on team ownership boundaries produced more stable APIs than splitting on data entities."
✗ "This is an important concept."          — no actual information
✗ "See the note for details."              — not a self-contained lesson
✗ A three-sentence preamble before the fact — front-load the substance

━━ RULES ━━
- Return ONLY valid JSON. No markdown fences, no prose outside the JSON.
- Generate ${min}–${max} flashcards.
- ATOMIC: one idea per card. Never combine two distinct facts into one card.
- prompt: 8–90 chars. Specific enough that the reader knows exactly what to recall.
- lesson: 1–3 sentences, 30–400 chars. Contain the actual fact — not a pointer to it.
- Banned prompts (exact or near match): "Key takeaway", "What I learned", "Main concept", "Summary", "Lesson", "Key idea", "Key details", "Key insight", "Important note".
- Do NOT repeat the same idea across multiple cards.
- Skip obvious or trivially memorable facts. Prioritise non-obvious distinctions, failure modes, counterintuitive results, and decision heuristics.
- Match kind precisely: use "tradeoff" only when the note explicitly compares two approaches; use "pattern" only when a reusable structure is described; default to "concept" or "lesson" otherwise.

━━ NOTE METADATA ━━
${JSON.stringify({ title: note.title, category: note.category, tags: note.tags, summary: note.summary }, null, 2)}

━━ NOTE CONTENT ━━
${markdown}

━━ OUTPUT FORMAT ━━
{
  "flashcards": [
    { "prompt": "...", "lesson": "...", "kind": "concept" }
  ]
}`;
  }
}
