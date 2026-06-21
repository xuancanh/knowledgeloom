import { Controller, Get, Post, Param, Body, UseGuards, Inject } from '@nestjs/common';
import { LearnProgressRepository } from './learn-progress.repository';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AI_PROVIDER, AiProvider } from '../ai/ai-provider.interface';
import { NotesService } from '../notes/notes.service';

@Controller('api/learn-progress')
@UseGuards(SupabaseAuthGuard)
export class LearnProgressController {
  constructor(
    private readonly repo: LearnProgressRepository,
    private readonly notes: NotesService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
  ) {}

  @Get()
  get(@CurrentUser() userId: string) {
    return this.repo.get(userId);
  }

  @Post('award')
  award(@CurrentUser() userId: string, @Body() body: { xp: number }) {
    const amount = Math.max(0, Math.min(1000, Number(body?.xp) || 0));
    return this.repo.award(userId, amount);
  }

  @Post('master/:noteId')
  master(@CurrentUser() userId: string, @Param('noteId') noteId: string) {
    return this.repo.master(userId, noteId);
  }

  @Post('generate-deck')
  async generateDeck(
    @CurrentUser() userId: string,
    @Body() body: { noteId: string; title: string; category: string; summary: string; tags: string[] },
  ) {
    const { noteId, title, category, summary, tags } = body;
    let markdown = '';
    try {
      markdown = await this.notes.getMarkdown(userId, noteId);
    } catch { /* use empty if note unreadable */ }

    const prompt = buildDeckPrompt({ title, category, summary, tags, markdown });
    try {
      const raw = await this.ai.complete(prompt, { outputFormat: 'json' });
      const jsonStr = raw.match(/```json\s*([\s\S]+?)\s*```/)?.[1]
        ?? raw.match(/```\s*([\s\S]+?)\s*```/)?.[1]
        ?? raw;
      return JSON.parse(jsonStr.trim());
    } catch {
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
