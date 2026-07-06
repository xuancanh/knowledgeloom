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
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { RemindersService } from '../reminders/reminders.service';
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
}
