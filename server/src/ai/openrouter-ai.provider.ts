/**
 * OpenRouterAiProvider — AiProvider backed by any OpenAI-compatible HTTP API.
 *
 * Compatible with:
 *  - OpenRouter (openrouter.ai) — access to hundreds of models via one key
 *  - DeepSeek (api.deepseek.com) — cost-efficient reasoning models
 *  - Ollama (localhost:11434/v1) — fully local/offline models
 *  - Any other OpenAI-compatible endpoint
 *
 * Configuration (via environment variables / .env):
 *
 *   AI_PROVIDER=openrouter          # activates this provider
 *   AI_API_KEY=sk-...               # API key (required for cloud providers)
 *   AI_API_BASE_URL=https://openrouter.ai/api/v1   # default shown
 *   AI_MODEL=anthropic/claude-3-5-sonnet            # any model the API serves
 *   AI_SYSTEM_PROMPT=...            # optional custom system prompt
 *
 * The provider sends a single-turn chat completion. For models that reason
 * better with a system message, set AI_SYSTEM_PROMPT accordingly.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AiProvider, AiCompletionOptions, AiMessage } from './ai-provider.interface';

@Injectable()
export class OpenRouterAiProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly systemPrompt: string | undefined;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('aiApiKey') || '';
    this.baseUrl = config.get<string>('aiApiBaseUrl') || 'https://openrouter.ai/api/v1';
    this.model = config.get<string>('aiModel') || 'anthropic/claude-3-5-sonnet';
    this.systemPrompt = config.get<string>('aiSystemPrompt') || undefined;
  }

  async complete(prompt: string, opts?: AiCompletionOptions): Promise<string> {
    const messages: any[] = [];

    if (this.systemPrompt) {
      messages.push({ role: 'system', content: this.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        // OpenRouter requires a site URL and app title for rate limiting.
        'HTTP-Referer': 'https://github.com/knowledge-loom',
        'X-Title': 'Knowledge Loom',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        // Request JSON mode for structured outputs when the caller signals it.
        ...(opts?.outputFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI API ${response.status}: ${text}`);
    }

    const data: any = await response.json();
    const content: string = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('AI API returned an empty response');
    return content.trim();
  }

  async *completeStream(messages: AiMessage[], opts?: AiCompletionOptions): AsyncGenerator<string> {
    const apiMessages: any[] = [];
    if (this.systemPrompt) apiMessages.push({ role: 'system', content: this.systemPrompt });
    apiMessages.push(...messages);

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        'HTTP-Referer': 'https://github.com/knowledge-loom',
        'X-Title': 'Knowledge Loom',
      },
      body: JSON.stringify({
        model: this.model,
        messages: apiMessages,
        stream: true,
        ...(opts?.outputFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AI API ${response.status}: ${text}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const parsed = JSON.parse(payload);
          const token: string = parsed.choices?.[0]?.delta?.content ?? '';
          if (token) yield token;
        } catch { /* skip malformed lines */ }
      }
    }
  }
}
