import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { AI_PROVIDER, AiProvider } from '../ai/ai-provider.interface';
import { QuizCacheRepository } from './quiz-cache.repository';
import { QuizReviewsRepository, type QuizReview } from './quiz-reviews.repository';
import { QuizHiddenRepository } from './quiz-hidden.repository';
import type { KnowledgeNote, NoteSource, QuizQuestion } from '../types';

@Injectable()
export class QuizService {
  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly cacheRepo: QuizCacheRepository,
    private readonly reviewsRepo: QuizReviewsRepository,
    private readonly hiddenRepo: QuizHiddenRepository,
    private readonly config: ConfigService,
  ) {}

  /**
   * Compute next review date based on correctness and streak.
   * Simple streak-based schedule (not full SM-2).
   */
  computeReview(rating: 'correct' | 'wrong', currentStreak: number): {
    nextReviewAt: string;
    streak: number;
  } {
    const newStreak = rating === 'correct' ? currentStreak + 1 : 0;
    const daysUntilNext =
      rating === 'wrong' ? 1
      : newStreak === 1 ? 3
      : newStreak === 2 ? 7
      : 14;
    const next = new Date();
    next.setDate(next.getDate() + daysUntilNext);
    return { nextReviewAt: next.toISOString(), streak: newStreak };
  }

  async sync(userId: string, noteSources: NoteSource[], { force = false, aiEnabled = true } = {}): Promise<QuizQuestion[]> {
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
            const prompt = this.buildPrompt(note, markdown);
            const output = await this.ai.complete(prompt, { outputFormat: 'json' });
            const questions = this.normalize(note, this.parseJson(output));
            nextNotes[note.id] = { hash: this.noteHash(note, markdown), questions, generatedAt: new Date().toISOString() };
          } catch (err) {
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

  private normalize(note: KnowledgeNote, rawQuestions: any[]): QuizQuestion[] {
    const validTypes = new Set(['fill-blank', 'multiple-choice', 'short-answer']);
    const results: QuizQuestion[] = [];

    for (const q of rawQuestions) {
      const type = String(q.type || '').trim().toLowerCase();
      if (!validTypes.has(type)) continue;

      const question = String(q.question || '').trim();
      const answer = String(q.answer || '').trim();
      if (!question || !answer) continue;

      const base = {
        id: `quiz-${note.id}-${randomUUID()}`,
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

    return results.slice(0, 6);
  }

  private buildPrompt(note: KnowledgeNote, markdown: string): string {
    return `Generate quiz questions from this knowledge note to test comprehension and recall.

Rules:
- Return only valid JSON. No markdown fences, no commentary.
- Generate 3 to 6 questions mixing all three types.
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
