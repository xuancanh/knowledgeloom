# AI Module — Spec

**Location**: `server/src/ai/`  
**NestJS module**: `AiModule`  
**Injection token**: `AI_PROVIDER` (string constant in `ai-provider.interface.ts`)

---

## Purpose

Provides a single pluggable AI text-generation backend. All callers
(`CodexService`, `FlashcardsService`) depend only on `AiProvider`; the
concrete implementation is selected at startup via the `AI_PROVIDER` env var.

---

## Interface

```typescript
interface AiMessage { role: 'system' | 'user' | 'assistant'; content: string; }

interface AiProvider {
  complete(prompt: string, opts?: AiCompletionOptions): Promise<string>;
  completeStream(messages: AiMessage[], opts?: AiCompletionOptions): AsyncGenerator<string>;
}

interface AiCompletionOptions {
  outputFormat?: 'text' | 'json';
}
```

`complete()` returns raw text (may contain markdown, JSON, or plain prose
depending on the prompt). Callers are responsible for parsing the output.

`completeStream()` takes a structured message array and yields AI tokens
incrementally as an `AsyncGenerator<string>`.

---

## Implementations

### CodexAiProvider (`AI_PROVIDER=codex`, default)

Delegates to `CodexRunnerService.run(prompt, ext)`.

- `outputFormat: 'json'` → writes a `.json` temp file; otherwise `.md`.
- `CodexRunnerService` spawns `codex exec` as a child process, reads the output
  file, and cleans up. See `codex/spec.md` for details.
- `completeStream()` is a fallback — calls `this.complete()` with the messages
  stringified and yields the full result as one chunk. Codex CLI does not
  support true streaming.

### OpenRouterAiProvider (`AI_PROVIDER=openrouter`)

Calls any OpenAI-compatible chat completions endpoint.

Compatible providers:
- **OpenRouter** (`https://openrouter.ai/api/v1`) — multi-model gateway
- **DeepSeek** (`https://api.deepseek.com/v1`) — cost-efficient reasoning
- **Ollama** (`http://localhost:11434/v1`) — fully local, no API key

`completeStream()` sends `stream: true` in the request body, reads the response
body as a `ReadableStream`, decodes with `TextDecoder`, parses SSE lines
(`data: {...}`), and extracts `choices[0].delta.content`. Returns on the
`data: [DONE]` sentinel.

Configuration:
| Env var | Default | Description |
|---------|---------|-------------|
| `AI_API_KEY` | — | Bearer token (omitted for Ollama) |
| `AI_API_BASE_URL` | `https://openrouter.ai/api/v1` | Base URL |
| `AI_MODEL` | `anthropic/claude-3-5-sonnet` | Model identifier |
| `AI_SYSTEM_PROMPT` | — | Optional system message |

`outputFormat: 'json'` requests `response_format: { type: 'json_object' }` when
the API supports it (OpenAI-compatible JSON mode).

---

## Module wiring

`AiModule` uses a factory provider:

```typescript
{
  provide: AI_PROVIDER,
  inject: [ConfigService, CodexRunnerService],
  useFactory: (config, runner) => {
    const backend = config.get('aiProvider') || 'codex';
    if (backend === 'openrouter') return new OpenRouterAiProvider(config);
    return new CodexAiProvider(runner);
  },
}
```

`AiModule` imports `CodexRunnerModule` (not `CodexModule`) to avoid a circular
dependency with `FlashcardsModule`.

---

## Adding a new AI provider

1. Create `your-provider.ts` implementing `AiProvider`. New providers must
   implement both `complete()` and `completeStream()`.
2. Add a branch to the factory in `ai.module.ts`.
3. Document the new `AI_PROVIDER` value and its env vars in `AGENTS.md`.
