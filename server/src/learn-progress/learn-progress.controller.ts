import { Controller, Get, Post, Param, Body, UseGuards, Inject, Logger, BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { LearnProgressRepository } from './learn-progress.repository';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentScope } from '../auth/current-scope.decorator';
import { AI_PROVIDER, AiProvider } from '../ai/ai-provider.interface';
import { NotesService } from '../notes/notes.service';
import { USAGE_SERVICE, UsageService } from '../usage/usage.interface';
import { AiDeck, parseAiJson, sanitizeAiDeck } from './deck-sanitizer';

/** Generated decks are cached per note content so replaying a lesson does not re-bill the AI provider. */
const DECK_CACHE_MAX = 200;

@Controller('api/learn-progress')
@UseGuards(ApiAuthGuard)
export class LearnProgressController {
  private readonly logger = new Logger(LearnProgressController.name);
  private readonly deckCache = new Map<string, AiDeck>();

  constructor(
    private readonly repo: LearnProgressRepository,
    private readonly notes: NotesService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @Inject(USAGE_SERVICE) private readonly usage: UsageService,
  ) {}

  @Get()
  get(@CurrentScope() userId: string) {
    return this.repo.get(userId);
  }

  @Post('award')
  award(@CurrentScope() userId: string, @Body() body: { xp: number }) {
    const amount = Math.max(0, Math.min(1000, Number(body?.xp) || 0));
    return this.repo.award(userId, amount);
  }

  @Post('master/:noteId')
  master(@CurrentScope() userId: string, @Param('noteId') noteId: string) {
    return this.repo.master(userId, noteId);
  }

  @Post('generate-deck')
  async generateDeck(
    @CurrentScope() userId: string,
    @Body() body: { noteId?: string; title?: string; category?: string; summary?: string; tags?: string[] },
  ): Promise<AiDeck | null> {
    const noteId = typeof body?.noteId === 'string' ? body.noteId.trim() : '';
    if (!noteId) throw new BadRequestException('noteId is required');
    const title = typeof body?.title === 'string' ? body.title : '';
    const category = typeof body?.category === 'string' ? body.category : '';
    const summary = typeof body?.summary === 'string' ? body.summary : '';
    const tags = Array.isArray(body?.tags) ? body.tags.filter((t): t is string => typeof t === 'string') : [];

    let markdown = '';
    try {
      markdown = await this.notes.getMarkdown(userId, noteId);
    } catch { /* use empty if note unreadable */ }

    const cacheKey = `${userId}:${noteId}:${createHash('sha1').update(markdown || title + summary).digest('hex')}`;
    const cached = this.deckCache.get(cacheKey);
    if (cached) return cached;

    // Cache hits above are free; only a real generation consumes quota.
    await this.usage.checkQuota(userId, 'ai.deck');

    const prompt = buildDeckPrompt({ title, category, summary, tags, markdown });
    try {
      const raw = await this.ai.complete(prompt, { outputFormat: 'json' });
      await this.usage.track(userId, 'ai.deck', { noteId });
      const deck = sanitizeAiDeck(parseAiJson(raw));
      if (!deck) {
        this.logger.warn(`generate-deck: AI response for note ${noteId} had no usable sections`);
        return null;
      }
      this.deckCache.set(cacheKey, deck);
      if (this.deckCache.size > DECK_CACHE_MAX) {
        const oldest = this.deckCache.keys().next().value;
        if (oldest) this.deckCache.delete(oldest);
      }
      return deck;
    } catch (err) {
      this.logger.warn(`generate-deck failed for note ${noteId}: ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }
}

function buildDeckPrompt(note: {
  title: string; category: string; summary: string; tags: string[]; markdown: string;
}): string {
  const body = note.markdown.replace(/^---[\s\S]+?---\n*/m, '').slice(0, 3500);
  return `You are an expert learning content creator. Generate engaging study cards from this knowledge note.

Title: ${note.title}
Category: ${note.category}
Summary: ${note.summary}
Tags: ${note.tags.join(', ')}

Content:
${body}

Return a JSON object (no markdown, no explanation) with these keys:

"teach": array of 2-3 objects { "head": "section heading (3-6 words)", "paras": ["paragraph (max 200 chars)"] } — explain the core ideas clearly.

"insight": { "text": "one powerful memorable sentence or key insight from this note" }

"flash": array of 3-4 objects { "front": "question or prompt", "back": "precise short answer" } — spaced-repetition flashcards.

"quiz": array of 1-2 objects { "prompt": "multiple-choice question", "options": ["option A","option B","option C","option D"], "answer": "verbatim correct option text", "feedback": "brief explanation of why" } — make all options plausible.

"podcast": { "lines": [{ "who": "maya" or "theo", "text": "spoken text" }] } — 8-10 lines of natural conversation between Maya and Theo exploring this topic. Alternate hosts. Be insightful and engaging.

"recap": { "takeaways": ["memorable sentence 1", "memorable sentence 2", "memorable sentence 3"] }

Return ONLY the JSON object starting with {`;
}
