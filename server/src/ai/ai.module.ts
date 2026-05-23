/**
 * AiModule — selects and provides the active AiProvider implementation.
 *
 * The AI_PROVIDER environment variable controls which backend is used:
 *
 *   AI_PROVIDER=codex        (default) — Codex CLI process runner
 *   AI_PROVIDER=openrouter   — OpenAI-compatible HTTP API
 *
 * Switching providers requires only an env change and a server restart;
 * no code changes are needed in FlashcardsService or CodexService.
 *
 * AiModule imports CodexRunnerModule so the codex provider can inject the
 * runner without re-declaring it.
 *
 * @example .env
 *   # Use DeepSeek via OpenRouter
 *   AI_PROVIDER=openrouter
 *   AI_API_BASE_URL=https://openrouter.ai/api/v1
 *   AI_API_KEY=sk-or-...
 *   AI_MODEL=deepseek/deepseek-chat
 *
 * @example .env
 *   # Use a local Ollama model (no API key needed)
 *   AI_PROVIDER=openrouter
 *   AI_API_BASE_URL=http://localhost:11434/v1
 *   AI_MODEL=llama3.2
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CodexRunnerModule } from '../codex/codex-runner.module';
import { CodexRunnerService } from '../codex/codex-runner.service';
import { CodexAiProvider } from './codex-ai.provider';
import { OpenRouterAiProvider } from './openrouter-ai.provider';
import { AI_PROVIDER } from './ai-provider.interface';

const aiProviderFactory = {
  provide: AI_PROVIDER,
  inject: [ConfigService, CodexRunnerService],
  useFactory: (config: ConfigService, runner: CodexRunnerService) => {
    const backend = config.get<string>('aiProvider') || 'codex';
    if (backend === 'openrouter') {
      return new OpenRouterAiProvider(config);
    }
    // Default: Codex CLI
    return new CodexAiProvider(runner);
  },
};

@Module({
  imports: [CodexRunnerModule],
  providers: [aiProviderFactory, CodexAiProvider, OpenRouterAiProvider],
  exports: [AI_PROVIDER],
})
export class AiModule {}
