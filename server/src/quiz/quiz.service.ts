import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { AI_PROVIDER, AiProvider } from '../ai/ai-provider.interface';
import { QuizCacheRepository } from './quiz-cache.repository';
import { QuizReviewsRepository, type QuizReview } from './quiz-reviews.repository';
import { QuizHiddenRepository } from './quiz-hidden.repository';
import type { GenSize, KnowledgeNote, NoteSource, QuizQuestion } from '../types';

const SIZE_RANGE: Record<GenSize, { min: number; max: number; cap: number }> = {
  small:  { min: 5,  max: 10, cap: 10 },
  medium: { min: 10, max: 20, cap: 20 },
  large:  { min: 20, max: 40, cap: 40 },
};

@Injectable()
export class QuizService {
  private readonly logger = new Logger(QuizService.name);

  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly cacheRepo: QuizCacheRepository,
    private readonly reviewsRepo: QuizReviewsRepository,
    private readonly hiddenRepo: QuizHiddenRepository,
    private readonly config: ConfigService,
  ) {}

  // Review scheduling moved to ../scheduling/fsrs.ts (FSRS-4.5).

  /** Seeds the quiz cache for a note with pre-made questions (marketplace imports). */
  async seedCache(userId: string, note: KnowledgeNote, markdown: string, rawQuestions: any[]): Promise<number> {
    const questions = this.normalize(note, rawQuestions, 'large');
    const cache = await this.cacheRepo.load(userId);
    cache[note.id] = { hash: this.noteHash(note, markdown), questions, generatedAt: new Date().toISOString() };
    await this.cacheRepo.replace(userId, cache);
    return questions.length;
  }

  async sync(userId: string, noteSources: NoteSource[], { force = false, aiEnabled = true, size = 'small' as GenSize } = {}): Promise<QuizQuestion[]> {
    const cache = await this.cacheRepo.load(userId);
    const disabled = this.config.get<boolean>('aiFlashcardsDisabled') || !aiEnabled;

    if (disabled) {
      const noteIds = new Set(noteSources.map(({ note }) => note.id));
      return Object.entries(cache)
        .filter(([noteId]) => noteIds.has(noteId))
        .flatMap(([, entry]) => entry.questions || []);
    }

    const nextNotes: Record<string, any> = {};
    const uncached: NoteSource[] = [];

    for (const source of noteSources) {
      const { note, markdown } = source;
      const hash = this.noteHash(note, markdown);
      const cached = cache[note.id];
      if (!force && cached?.hash === hash && Array.isArray(cached.questions)) {
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
            const questions = this.normalize(note, this.parseJson(output), size);
            nextNotes[note.id] = { hash: this.noteHash(note, markdown), questions, generatedAt: new Date().toISOString() };
          } catch (err) {
            this.logger.warn(`quiz generation failed for ${note.id}: ${(err as Error).message}`);
            if (cache[note.id]) nextNotes[note.id] = cache[note.id];
          }
        }),
      );
    }

    await this.cacheRepo.replace(userId, nextNotes);
    return Object.values(nextNotes).flatMap((entry: any) => entry.questions || []);
  }

  async loadEnrichedData(userId: string, noteSources: NoteSource[]): Promise<{
    allQuestions: QuizQuestion[];
    reviews: Map<string, QuizReview>;
  }> {
    const aiQuestions = await this.sync(userId, noteSources);
    const hidden = await this.hiddenRepo.loadAll(userId);
    const reviews = await this.reviewsRepo.loadAll(userId);

    const allQuestions = aiQuestions.filter((q) => !hidden.has(q.id));
    return { allQuestions, reviews };
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
    if (start < 0 || end < start) throw new Error('AI did not return quiz JSON');
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    if (!Array.isArray(parsed.questions)) throw new Error('AI quiz JSON is missing questions array');
    return parsed.questions;
  }

  private normalize(note: KnowledgeNote, rawQuestions: any[], size: GenSize = 'small'): QuizQuestion[] {
    const validTypes = new Set(['fill-blank', 'multiple-choice', 'short-answer']);
    const results: QuizQuestion[] = [];

    // Content-derived ids: regenerating an unchanged question preserves its id
    // and therefore the user's streak/review schedule (random ids reset both).
    const seen = new Map<string, number>();
    const stableId = (question: string) => {
      const base = `quiz-${note.id}-${createHash('sha1').update(question).digest('hex').slice(0, 10)}`;
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      return n === 1 ? base : `${base}-${n}`;
    };

    for (const q of rawQuestions) {
      const type = String(q.type || '').trim().toLowerCase();
      if (!validTypes.has(type)) continue;

      const question = String(q.question || '').trim();
      const answer = String(q.answer || '').trim();
      if (!question || !answer) continue;

      const base = {
        id: stableId(question),
        noteId: note.id,
        noteTitle: note.title,
        category: note.category,
        tags: note.tags,
        type: type as QuizQuestion['type'],
        question,
        answer,
        explanation: q.explanation ? String(q.explanation).trim() : undefined,
      };

      if (type === 'multiple-choice') {
        const choices = Array.isArray(q.choices) ? q.choices.map((c: any) => String(c).trim()).filter(Boolean) : [];
        const correctIndex = typeof q.correctIndex === 'number' ? q.correctIndex : choices.indexOf(answer);
        if (choices.length < 2 || correctIndex < 0 || correctIndex >= choices.length) continue;
        results.push({ ...base, choices, correctIndex });
      } else if (type === 'fill-blank') {
        if (!question.includes('___')) continue;
        results.push(base);
      } else {
        if (answer.length < 20) continue;
        results.push(base);
      }
    }

    return results.slice(0, SIZE_RANGE[size].cap);
  }

  private buildPrompt(note: KnowledgeNote, markdown: string, size: GenSize = 'small'): string {
    const { min, max } = SIZE_RANGE[size];
    return `Generate quiz questions from this knowledge note to test comprehension and recall.

Rules:
- Return only valid JSON. No markdown fences, no commentary.
- Generate ${min} to ${max} questions mixing all three types.
- For "fill-blank": write a sentence from the note with one key term replaced by ___ (exactly three underscores). The "answer" is the missing term.
- For "multiple-choice": write a clear question and provide exactly 4 choices as an array. "correctIndex" is the 0-based index of the correct choice. Include a brief "explanation" for why the answer is correct.
- For "short-answer": write an open-ended question that requires synthesis or explanation. "answer" is a complete reference answer (at least 30 words). Include a brief "explanation" summarising the key point.
- All questions must be grounded in the note — never hallucinate facts.
- Prefer questions that test understanding, not just recall of phrasing.

Note metadata:
${JSON.stringify({ id: note.id, title: note.title, category: note.category, tags: note.tags, summary: note.summary }, null, 2)}

Markdown:
${markdown}

Return this exact JSON shape:
{
  "questions": [
    { "type": "fill-blank", "question": "The ___ protocol ensures reliable delivery.", "answer": "TCP" },
    { "type": "multiple-choice", "question": "Which data structure gives O(1) average lookup?", "choices": ["Array", "Hash map", "Linked list", "Binary tree"], "correctIndex": 1, "answer": "Hash map", "explanation": "Hash maps use a hash function to map keys to buckets, giving O(1) average lookup." },
    { "type": "short-answer", "question": "Explain the trade-off between consistency and availability in distributed systems.", "answer": "The CAP theorem states that a distributed system can guarantee at most two of: consistency, availability, and partition tolerance. During a network partition, systems must choose between returning potentially stale data (availability) or refusing to respond until consistency is restored.", "explanation": "The CAP theorem is a fundamental constraint in distributed systems design." }
  ]
}
`;
  }
}
