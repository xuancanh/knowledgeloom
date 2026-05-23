/**
 * CodexAiProvider — AiProvider implementation that delegates to the Codex CLI.
 *
 * This is the original AI backend. It spawns `codex exec` as a child process,
 * writes the output to a temp file, and returns the content. The CLI handles
 * all context, model selection, and sandboxing internally.
 *
 * Enabled when AI_PROVIDER=codex (or when AI_PROVIDER is unset, as it is the
 * default for backwards compatibility).
 */
import { Injectable } from '@nestjs/common';
import { CodexRunnerService } from '../codex/codex-runner.service';
import type { AiProvider, AiCompletionOptions } from './ai-provider.interface';

@Injectable()
export class CodexAiProvider implements AiProvider {
  constructor(private readonly runner: CodexRunnerService) {}

  complete(prompt: string, opts?: AiCompletionOptions): Promise<string> {
    const ext = opts?.outputFormat === 'json' ? 'json' : 'md';
    return this.runner.run(prompt, ext);
  }
}
