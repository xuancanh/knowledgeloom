/**
 * TtsService — renders podcast dialogue to audio via any OpenAI-compatible
 * /audio/speech endpoint (TTS_PROVIDER=openai). Each line is synthesized with
 * the voice mapped to its host and the MP3 buffers are concatenated — players
 * handle back-to-back MP3 streams fine.
 *
 * Results are cached in memory by content hash so replaying a session never
 * re-bills the provider.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';

export interface PodcastLine {
  who: string; // 'maya' | 'theo' (unknown hosts fall back to voice A)
  text: string;
}

const CACHE_MAX_ENTRIES = 16;

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly cache = new Map<string, Buffer>();

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<string>('ttsProvider') === 'openai';
  }

  /** Cache key for a line set — callers use it to detect cache hits (no quota). */
  cacheKey(lines: PodcastLine[]): string {
    return createHash('sha1').update(JSON.stringify(lines.map((l) => [l.who, l.text]))).digest('hex');
  }

  isCached(lines: PodcastLine[]): boolean {
    return this.cache.has(this.cacheKey(lines));
  }

  async synthesize(lines: PodcastLine[]): Promise<Buffer> {
    if (!this.enabled) {
      throw Object.assign(new Error('text-to-speech is not configured (set TTS_API_KEY)'), { status: 501 });
    }
    const key = this.cacheKey(lines);
    const hit = this.cache.get(key);
    if (hit) return hit;

    const voiceA = this.config.get<string>('ttsVoiceA');
    const voiceB = this.config.get<string>('ttsVoiceB');
    const chunks = await Promise.all(
      lines.map((line) => this.speakLine(line.text, line.who === 'theo' ? voiceB : voiceA)),
    );
    const audio = Buffer.concat(chunks);

    this.cache.set(key, audio);
    if (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    return audio;
  }

  private async speakLine(text: string, voice: string): Promise<Buffer> {
    const base = (this.config.get<string>('ttsApiBase') || '').replace(/\/$/, '');
    const key = this.config.get<string>('ttsApiKey');
    const res = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model: this.config.get<string>('ttsModel'),
        voice,
        input: text,
        response_format: 'mp3',
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.warn(`TTS ${res.status}: ${detail.slice(0, 200)}`);
      throw Object.assign(new Error(`speech synthesis failed (${res.status})`), { status: 502 });
    }
    return Buffer.from(await res.arrayBuffer());
  }
}
