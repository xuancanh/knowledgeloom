/**
 * AiProvider — abstract interface for the text-generation backend.
 *
 * Decouples the application from any specific AI infrastructure. Callers
 * (FlashcardsService, CodexService) depend only on this interface so the
 * underlying implementation can be swapped without touching business logic.
 *
 * Two implementations ship out of the box:
 *  - CodexAiProvider   — spawns the `codex exec` CLI (original behaviour)
 *  - OpenRouterAiProvider — calls any OpenAI-compatible HTTP API
 *                           (OpenRouter, DeepSeek, local Ollama, etc.)
 *
 * The active implementation is selected by the AI_PROVIDER environment variable.
 */
export interface AiProvider {
  /**
   * Sends a text prompt and returns the model's response.
   *
   * @param prompt  The full prompt string to send.
   * @param opts    Optional hints to the provider (output format, etc.).
   * @returns       The raw text response (may contain JSON, markdown, etc.).
   */
  complete(prompt: string, opts?: AiCompletionOptions): Promise<string>;
}

export interface AiCompletionOptions {
  /** Expected output format — providers may use this as a hint. */
  outputFormat?: 'text' | 'json';
}

/** Injection token for the AiProvider. */
export const AI_PROVIDER = 'AI_PROVIDER';
