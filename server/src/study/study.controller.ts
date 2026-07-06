/**
 * StudyController — the unified "Today" study queue.
 *
 * GET /api/study/today
 *   Returns everything due for review right now, merged across features:
 *     - flashcards: due (nextReviewAt <= now) plus a capped batch of new cards
 *     - quiz: due questions plus a capped batch of new ones
 *     - reminders: active reminders due today or overdue
 *
 * The queue is assembled from the same enriched knowledge state the frontend
 * already consumes, so review data and hidden-card filtering are consistent
 * with the flashcards/quiz pages.
 */
import { Controller, Get, Post, Body, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { buildExamPlan, type ExamItem } from './exam-plan';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { RemindersService } from '../reminders/reminders.service';
import { ReviewEventsRepository } from './review-events.repository';
import { UserFlashcardsRepository } from '../flashcards/user-flashcards.repository';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

/** New (never-reviewed) items are throttled so day one isn't a 500-card wall. */
const NEW_ITEMS_CAP = 20;

@Controller('api/study')
@UseGuards(ApiAuthGuard)
export class StudyController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly remindersService: RemindersService,
    private readonly eventsRepo: ReviewEventsRepository,
    private readonly userFlashcardsRepo: UserFlashcardsRepository,
  ) {}

  @Get('today')
  async today(@CurrentUser() userId: string, @Query('newCap') newCapRaw?: string) {
    const newCap = Math.max(0, Math.min(100, Number(newCapRaw) || NEW_ITEMS_CAP));
    const now = Date.now();
    const state = await this.knowledgeService.getState(userId);

    const dueFlashcards: any[] = [];
    const newFlashcards: any[] = [];
    for (const card of state.flashcards || []) {
      const next = (card as any).reviewData?.nextReviewAt;
      if (next) {
        if (Date.parse(next) <= now) dueFlashcards.push(card);
      } else if (newFlashcards.length < newCap) {
        newFlashcards.push(card);
      }
    }

    const dueQuiz: any[] = [];
    const newQuiz: any[] = [];
    for (const q of state.quizQuestions || []) {
      const next = (q as any).reviewData?.nextReviewAt;
      if (next) {
        if (Date.parse(next) <= now) dueQuiz.push(q);
      } else if (newQuiz.length < newCap) {
        newQuiz.push(q);
      }
    }

    // Overdue-first so the longest-waiting material surfaces at the top.
    const byNext = (a: any, b: any) =>
      Date.parse(a.reviewData?.nextReviewAt || 0) - Date.parse(b.reviewData?.nextReviewAt || 0);
    dueFlashcards.sort(byNext);
    dueQuiz.sort(byNext);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const active = await this.remindersService.list(userId, { status: 'active' });
    const reminders = active.filter((r) => Date.parse(r.remindAt) <= endOfToday.getTime());

    return {
      flashcards: [...dueFlashcards, ...newFlashcards],
      quiz: [...dueQuiz, ...newQuiz],
      reminders,
      counts: {
        flashcards: dueFlashcards.length + newFlashcards.length,
        dueFlashcards: dueFlashcards.length,
        newFlashcards: newFlashcards.length,
        quiz: dueQuiz.length + newQuiz.length,
        dueQuiz: dueQuiz.length,
        newQuiz: newQuiz.length,
        reminders: reminders.length,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * GET /api/study/stats — retention analytics over the review-event log.
   *
   * "Retention" is the success rate (grade >= 2) of reviews whose elapsed
   * time was at least the window floor: reviews answered days after last
   * seeing the card measure memory, same-day reviews measure learning.
   * Weakest topics rank notes by success rate (minimum 3 attempts).
   */
  @Get('stats')
  async stats(@CurrentUser() userId: string, @Query('days') daysRaw?: string) {
    const days = Math.max(1, Math.min(365, Number(daysRaw) || 30));
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const events = await this.eventsRepo.since(userId, since);
    const state = await this.knowledgeService.getState(userId);
    const noteMeta = new Map(state.notes.map((n) => [n.id, { title: n.title, category: n.category }]));

    const success = (e: { grade: number }) => e.grade >= 2;
    const rate = (list: { grade: number }[]) =>
      list.length ? Number((list.filter(success).length / list.length).toFixed(3)) : null;

    // Memory (delayed) vs learning (same-day) reviews.
    const delayed = events.filter((e) => e.elapsedDays >= 1);
    const delayed7 = delayed.filter((e) => e.elapsedDays >= 7);

    // Per-note aggregation → weakest topics.
    const byNote = new Map<string, { attempts: number; ok: number }>();
    for (const e of events) {
      if (!e.noteId) continue;
      const agg = byNote.get(e.noteId) || { attempts: 0, ok: 0 };
      agg.attempts += 1;
      if (success(e)) agg.ok += 1;
      byNote.set(e.noteId, agg);
    }
    const weakestTopics = [...byNote.entries()]
      .filter(([, a]) => a.attempts >= 3)
      .map(([noteId, a]) => ({
        noteId,
        title: noteMeta.get(noteId)?.title ?? noteId,
        category: noteMeta.get(noteId)?.category ?? '',
        attempts: a.attempts,
        successRate: Number((a.ok / a.attempts).toFixed(3)),
      }))
      .sort((a, b) => a.successRate - b.successRate)
      .slice(0, 10);

    // Per-category success rates.
    const byCategory = new Map<string, { attempts: number; ok: number }>();
    for (const e of events) {
      const category = noteMeta.get(e.noteId)?.category ?? 'Unknown';
      const agg = byCategory.get(category) || { attempts: 0, ok: 0 };
      agg.attempts += 1;
      if (success(e)) agg.ok += 1;
      byCategory.set(category, agg);
    }
    const categories = [...byCategory.entries()]
      .map(([category, a]) => ({ category, attempts: a.attempts, successRate: Number((a.ok / a.attempts).toFixed(3)) }))
      .sort((a, b) => a.successRate - b.successRate);

    return {
      windowDays: days,
      totals: {
        reviews: events.length,
        flashcardReviews: events.filter((e) => e.itemType === 'flashcard').length,
        quizReviews: events.filter((e) => e.itemType === 'quiz').length,
        successRate: rate(events),
        // headline metrics: recall after >=1d / >=7d gaps
        retention1d: rate(delayed),
        retention7d: rate(delayed7),
      },
      categories,
      weakestTopics,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * POST /api/study/exam-plan — date-targeted study schedule.
   * Body: { examDate: 'YYYY-MM-DD', scope?: { category?, tag?, noteIds? } }
   * Scope filters the vault's flashcards + quiz questions; the plan builder
   * lays them out learning → consolidation → final weakest-items review.
   */
  @Post('exam-plan')
  async examPlan(
    @CurrentUser() userId: string,
    @Body() body: { examDate?: string; scope?: { category?: string; tag?: string; noteIds?: string[] } },
  ) {
    const examDate = typeof body?.examDate === 'string' ? body.examDate.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(examDate)) throw new BadRequestException('examDate must be YYYY-MM-DD');
    if (Date.parse(`${examDate}T23:59:59Z`) < Date.now()) throw new BadRequestException('examDate is in the past');

    const scope = body?.scope || {};
    const state = await this.knowledgeService.getState(userId);
    const noteIds = Array.isArray(scope.noteIds) ? new Set(scope.noteIds) : null;
    const noteById = new Map(state.notes.map((n) => [n.id, n]));

    const inScope = (noteId: string) => {
      const note = noteById.get(noteId);
      if (!note) return false;
      if (noteIds) return noteIds.has(noteId);
      if (scope.category) return note.category === scope.category || note.category.startsWith(`${scope.category}/`);
      if (scope.tag) return note.tags.includes(scope.tag);
      return true;
    };

    // The cached state can lag just-created user cards (stale-while-revalidate),
    // so merge them in directly from their repository.
    const stateCardIds = new Set((state.flashcards || []).map((c: any) => c.id));
    const freshUserCards = (await this.userFlashcardsRepo.loadAll(userId))
      .filter((uc) => !stateCardIds.has(uc.id))
      .map((uc) => ({ id: uc.id, noteId: uc.noteId, reviewData: null }));

    const items: ExamItem[] = [
      ...freshUserCards.filter((c) => inScope(c.noteId)).map((c) => ({
        id: c.id,
        type: 'flashcard' as const,
        noteId: c.noteId,
        stability: null,
        lapses: 0,
      })),
      ...(state.flashcards || []).filter((c: any) => inScope(c.noteId)).map((c: any) => ({
        id: c.id,
        type: 'flashcard' as const,
        noteId: c.noteId,
        noteTitle: c.noteTitle,
        stability: c.reviewData ? c.reviewData.interval ?? null : null,
        lapses: 0,
      })),
      ...(state.quizQuestions || []).filter((q: any) => inScope(q.noteId)).map((q: any) => ({
        id: q.id,
        type: 'quiz' as const,
        noteId: q.noteId,
        noteTitle: q.noteTitle,
        stability: q.reviewData ? 1 : null,
        lapses: 0,
      })),
    ];
    if (!items.length) throw new BadRequestException('no study material in the selected scope');

    return buildExamPlan(items, examDate);
  }
}
