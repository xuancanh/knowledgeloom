/**
 * VisionService — extracts text from images (photos of notes, whiteboards,
 * handwriting, slides) via any OpenAI-compatible chat-completions endpoint
 * that accepts image_url content parts.
 *
 * Credentials default to the main AI provider's when it is HTTP-based
 * (AI_PROVIDER=openrouter); override with VISION_API_BASE/KEY/MODEL. With the
 * codex CLI provider and no VISION_API_KEY, image import is disabled.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const EXTRACT_PROMPT = `Transcribe all text and content from this image accurately.
- Preserve structure: headings, lists, tables (as markdown), equations.
- For handwriting, transcribe as faithfully as possible; mark unreadable words as [illegible].
- For diagrams, describe them briefly in [diagram: ...] blocks.
Return only the transcription, no commentary.`;

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('visionApiKey'));
  }

  async extractText(file: { buffer: Buffer; mimetype: string }): Promise<string> {
    if (!this.enabled) {
      throw Object.assign(new Error('image import is not configured (set VISION_API_KEY or use an HTTP AI provider)'), { status: 501 });
    }
    const base = (this.config.get<string>('visionApiBase') || '').replace(/\/$/, '');
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.get<string>('visionApiKey')}`,
      },
      body: JSON.stringify({
        model: this.config.get<string>('visionModel'),
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: EXTRACT_PROMPT },
            { type: 'image_url', image_url: { url: dataUri } },
          ],
        }],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.warn(`vision extraction ${res.status}: ${detail.slice(0, 200)}`);
      throw Object.assign(new Error(`image extraction failed (${res.status})`), { status: 502 });
    }
    const json: any = await res.json();
    const text = String(json?.choices?.[0]?.message?.content || '').trim();
    if (!text) throw Object.assign(new Error('image extraction returned no text'), { status: 502 });
    return text;
  }
}
