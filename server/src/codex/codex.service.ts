/**
 * CodexService — AI-assisted note creation and editing.
 *
 * Wraps the CodexRunner (which spawns the `codex exec` CLI) with three
 * higher-level operations:
 *
 *  - createNote(payload)  — generates a full markdown note from a job payload
 *                           (research, link, or polish modes).
 *  - assistEdit(id, draft, instruction) — produces an edit proposal for an
 *                           existing note without writing it; the UI shows the
 *                           proposal and the user saves through PUT /api/notes.
 *
 * Neither function decides on persistence itself.  createNote writes the
 * generated file and calls rebuildIndexes(); assistEdit returns a structured
 * proposal that the controller sends back to the client.
 *
 * Injects AiProvider rather than CodexRunnerService directly so the underlying
 * AI backend (Codex CLI, OpenRouter, DeepSeek, Ollama…) can be swapped via
 * environment variable without modifying this service.
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { AI_PROVIDER, AiProvider } from '../ai/ai-provider.interface';
import { NoteFileRepository } from '../notes/note-file.repository';
import { KnowledgeService } from '../knowledge/knowledge.service';
import {
  parseNote,
  stripFrontmatter,
  noteRelativePath,
  uniqueNoteSlug,
} from '../common/note-parser.util';
import type { KnowledgeNote } from '../types';

@Injectable()
export class CodexService {
  private readonly notesDir: string;

  constructor(
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly noteRepo: NoteFileRepository,
    private readonly knowledgeService: KnowledgeService,
    private readonly config: ConfigService,
  ) {
    this.notesDir = config.get<string>('notesDir');
  }

  /**
   * Generates one AI-authored note and persists it. Called by JobsService
   * when a queued job is processed.
   *
   * @param payload  The full job payload forwarded from the queue.
   */
  async createNote(payload: any): Promise<any> {
    const mode = payload.mode === 'polish' ? 'polish' : payload.mode === 'link' ? 'link' : 'research';
    const topic = String(payload.topic || payload.title || '').trim();
    const existingNotes = await this.noteRepo.readAll();
    const slug = uniqueNoteSlug(topic || payload.url || 'linked-source', this.notesDir);

    const prompt =
      mode === 'polish'
        ? this.buildPolishPrompt({ ...payload, topic }, existingNotes)
        : mode === 'link'
          ? this.buildLinkPrompt({ ...payload, topic }, existingNotes)
          : this.buildResearchPrompt({ ...payload, topic }, existingNotes);

    const output = await this.ai.complete(prompt);
    const markdown = this.attachProvenance(output, {
      sourceUrl: mode === 'link' ? payload.url : '',
      originalRequest: this.originalRequestFor(payload, mode, topic),
    });

    // Write directly to notesDir root; rebuildIndexes migrates to correct folder.
    await writeFile(join(this.notesDir, `${slug}.md`), markdown.endsWith('\n') ? markdown : `${markdown}\n`);

    const state = await this.knowledgeService.rebuildIndexes();
    const note = state.notes.find((n) => n.id === slug);
    return { note, state, codexStatus: 'completed' };
  }

  /**
   * Generates an edit proposal for an in-progress draft that hasn't been saved yet.
   * Used by the capture box "AI Assist" feature on new notes.
   */
  async assistDraft(draft: any, instruction: string): Promise<any> {
    const existingNotes = await this.noteRepo.readAll();
    const prompt = this.buildDraftAssistPrompt({ draft, instruction, existingNotes });
    const output = await this.ai.complete(prompt);
    const update = this.parseEditAssistJson(output);
    const existingIds = new Set(existingNotes.map((n) => n.id));
    return {
      update: { ...update, links: update.links.filter((l: string) => existingIds.has(l)) },
      codexStatus: 'completed',
    };
  }

  /**
   * Generates an edit proposal for an existing note without writing to disk.
   * The controller returns the proposal to the client so the user can review
   * before saving through PUT /api/notes/:id.
   */
  async assistEdit(id: string, draft: any, instruction: string): Promise<any> {
    const safeId = basename(id);
    const currentMarkdown = await this.noteRepo.readMarkdown(safeId);
    const current = parseNote(`${safeId}.md`, currentMarkdown);
    const existingNotes = await this.noteRepo.readAll();

    const prompt = this.buildEditAssistPrompt({
      current,
      draft: {
        title: draft.title || current.title,
        category: draft.category || current.category,
        summary: draft.summary || current.summary,
        tags: Array.isArray(draft.tags) ? draft.tags : current.tags,
        links: Array.isArray(draft.links) ? draft.links : current.links,
        body: draft.body || stripFrontmatter(currentMarkdown),
      },
      instruction,
      existingNotes,
    });

    const output = await this.ai.complete(prompt);
    const update = this.parseEditAssistJson(output);
    const existingIds = new Set(existingNotes.map((n) => n.id));
    return {
      update: { ...update, links: update.links.filter((l: string) => existingIds.has(l)) },
      codexStatus: 'completed',
    };
  }

  // ---------------------------------------------------------------------------
  // Prompt builders
  // ---------------------------------------------------------------------------

  private buildResearchPrompt(payload: any, existingNotes: KnowledgeNote[]): string {
    const topic = String(payload.topic || '').trim();
    const context = String(payload.context || '').trim();
    const body = String(payload.body || '').trim();
    const guidance = String(payload.guidance || '').trim();
    const categoryHint = String(payload.category || '').trim();
    const tagsHint = Array.isArray(payload.tags) && payload.tags.length
      ? payload.tags.join(', ')
      : '';
    const related = existingNotes.slice(-20).map((n) => `- ${n.id}: ${n.title} (${n.category}) - ${n.summary}`).join('\n');

    const sections: string[] = [
      `Topic: ${topic}`,
      context ? `Learner context: ${context}` : '',
      body ? `User's existing notes on this topic:\n${body}` : '',
      guidance ? `Writing instructions: ${guidance}` : '',
      categoryHint ? `Suggested category: ${categoryHint}` : '',
      tagsHint ? `Suggested tags: ${tagsHint}` : '',
    ].filter(Boolean);

    return `Research this newly learned topic and produce one markdown knowledge note.

${sections.join('\n\n')}

Existing notes that can be linked by id:
${related || '- None yet'}

Return only markdown. Use this exact frontmatter schema.
---
title: "Clear note title"
category: "Folder/Subfolder"
summary: "One sentence summary"
tags: ["tag-one", "tag-two"]
links: ["existing-note-id"]
createdAt: "${new Date().toISOString()}"
---

# Clear note title

## What I learned
Explain the idea in practical terms.

## Why it matters
Explain when to use it and what tradeoffs matter.

## Key details
- Use compact bullets.
`;
  }

  private buildLinkPrompt(payload: any, existingNotes: KnowledgeNote[]): string {
    const context = String(payload.context || '').trim();
    const focus = String(payload.body || '').trim();
    const guidance = String(payload.guidance || '').trim();
    const categoryHint = String(payload.category || '').trim();
    const tagsHint = Array.isArray(payload.tags) && payload.tags.length
      ? payload.tags.join(', ')
      : '';
    const related = existingNotes.slice(-20).map((n) => `- ${n.id}: ${n.title} (${n.category}) - ${n.summary}`).join('\n');

    const sections: string[] = [
      `URL: ${payload.url}`,
      payload.topic ? `Title hint: ${payload.topic}` : '',
      context ? `Learner context: ${context}` : '',
      focus ? `What to focus on: ${focus}` : '',
      guidance ? `Writing instructions: ${guidance}` : '',
      categoryHint ? `Suggested category: ${categoryHint}` : '',
      tagsHint ? `Suggested tags: ${tagsHint}` : '',
    ].filter(Boolean);

    return `Retrieve this URL, read the main content, and produce one markdown knowledge note from it.

${sections.join('\n\n')}

Existing notes that can be linked by id:
${related || '- None yet'}

Return only markdown. Use this exact frontmatter schema.
---
title: "Clear note title"
category: "Folder/Subfolder"
summary: "One sentence summary"
tags: ["tag-one", "tag-two"]
links: ["existing-note-id"]
createdAt: "${new Date().toISOString()}"
---
`;
  }

  private buildPolishPrompt(payload: any, existingNotes: KnowledgeNote[]): string {
    const related = existingNotes.slice(-20).map((n) => `- ${n.id}: ${n.title} (${n.category}) - ${n.summary}`).join('\n');
    return `Polish this user-authored markdown note. Do not research. Do not add facts not in the draft.

Title: ${payload.topic}
Draft:
${payload.body}

Existing notes:
${related || '- None yet'}

Return only markdown with the same frontmatter schema.
`;
  }

  private buildDraftAssistPrompt({ draft, instruction, existingNotes }: any): string {
    const related = existingNotes
      .slice(-40)
      .map((n: KnowledgeNote) => `- ${n.id}: ${n.title} (${n.category}) - ${n.summary}`)
      .join('\n');
    return `Revise this new note draft according to the user's instruction.

Rules:
- Return only valid JSON. No markdown fence and no commentary.
- Preserve the user's intent. Do not invent new facts.
- The body must be markdown without YAML frontmatter.
- Links must be existing note ids only.

User instruction:
${instruction}

Existing note ids that may be linked if relevant:
${related || '- None'}

Draft:
${JSON.stringify(draft, null, 2)}

Return this exact JSON shape:
{
  "title": "string",
  "category": "string",
  "summary": "string",
  "tags": ["string"],
  "links": ["existing-note-id"],
  "body": "markdown body without frontmatter"
}
`;
  }

  private buildEditAssistPrompt({ current, draft, instruction, existingNotes }: any): string {
    const related = existingNotes
      .filter((n: KnowledgeNote) => n.id !== current.id)
      .slice(-40)
      .map((n: KnowledgeNote) => `- ${n.id}: ${n.title} (${n.category}) - ${n.summary}`)
      .join('\n');
    return `Revise this knowledge note draft according to the user's instruction.

Rules:
- Return only valid JSON. No markdown fence and no commentary.
- Preserve the user's intent. Do not invent new facts.
- The body must be markdown without YAML frontmatter.
- Links must be existing note ids only.

User instruction:
${instruction}

Existing note ids that may be linked if relevant:
${related || '- None'}

Current saved note metadata:
${JSON.stringify(current, null, 2)}

Editable draft:
${JSON.stringify(draft, null, 2)}

Return this exact JSON shape:
{
  "title": "string",
  "category": "string",
  "summary": "string",
  "tags": ["string"],
  "links": ["existing-note-id"],
  "body": "markdown body without frontmatter"
}
`;
  }

  // ---------------------------------------------------------------------------
  // Output parsers
  // ---------------------------------------------------------------------------

  private parseEditAssistJson(output: string): any {
    const trimmed = output.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Codex did not return a JSON edit proposal');
    const parsed = JSON.parse(trimmed.slice(start, end + 1));
    const title = String(parsed.title || '').trim();
    const body = String(parsed.body || '').trim();
    if (!title || !body) throw new Error('Codex edit proposal is missing title or body');
    return {
      title,
      category: String(parsed.category || 'Uncategorized').trim() || 'Uncategorized',
      summary: String(parsed.summary || '').trim(),
      tags: Array.isArray(parsed.tags) ? parsed.tags.map((t: unknown) => String(t).trim()).filter(Boolean) : [],
      links: Array.isArray(parsed.links) ? parsed.links.map((l: unknown) => String(l).trim()).filter(Boolean) : [],
      body,
    };
  }

  // ---------------------------------------------------------------------------
  // Provenance helpers
  // ---------------------------------------------------------------------------

  private attachProvenance(markdown: string, { sourceUrl, originalRequest }: { sourceUrl?: string; originalRequest?: string }): string {
    const lines: string[] = [];
    const esc = (v: string) => v.replace(/\n/g, ' ').replace(/"/g, '\\"');
    if (sourceUrl) lines.push(`sourceUrl: "${esc(sourceUrl)}"`);
    if (originalRequest) lines.push(`originalRequest: "${esc(originalRequest)}"`);
    if (!lines.length) return markdown;

    if (/^---\n[\s\S]*?\n---/.test(markdown)) {
      return markdown.replace(/^---\n([\s\S]*?)\n---/, (_m, fm) => {
        const filtered = fm.split('\n').filter((l: string) => !/^(sourceUrl|originalRequest):/.test(l)).join('\n');
        return `---\n${filtered}\n${lines.join('\n')}\n---`;
      });
    }
    return `---\n${lines.join('\n')}\n---\n\n${markdown}`;
  }

  private originalRequestFor(payload: any, mode: string, topic: string): string {
    if (mode === 'link') {
      return [topic && topic !== payload.url ? `Title hint: ${topic}` : '', `URL: ${payload.url}`, payload.context ? `Context: ${payload.context}` : '']
        .filter(Boolean)
        .join(' | ');
    }
    if (mode === 'research') {
      return [topic, payload.context ? `Context: ${payload.context}` : ''].filter(Boolean).join(' | ');
    }
    return '';
  }
}
