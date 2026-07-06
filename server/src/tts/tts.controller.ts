/**
 * TtsController — podcast audio endpoints.
 *
 *   GET  /api/tts/config   — { enabled } so the UI can offer the voice toggle
 *   POST /api/tts/podcast  — { lines: [{who,text}] } → audio/mpeg
 *
 * Synthesis consumes the 'ai.podcast' quota; cache hits are free.
 */
import {
  Controller, Get, Post, Body, Res, UseGuards, Inject,
  BadRequestException, NotImplementedException, BadGatewayException,
} from '@nestjs/common';
import type { Response } from 'express';
import { TtsService, PodcastLine } from './tts.service';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { USAGE_SERVICE, UsageService } from '../usage/usage.interface';

const MAX_LINES = 40;
const MAX_LINE_CHARS = 600;

@Controller('api/tts')
@UseGuards(ApiAuthGuard)
export class TtsController {
  constructor(
    private readonly tts: TtsService,
    @Inject(USAGE_SERVICE) private readonly usage: UsageService,
  ) {}

  @Get('config')
  config() {
    return { enabled: this.tts.enabled };
  }

  @Post('podcast')
  async podcast(
    @CurrentUser() userId: string,
    @Body() body: { lines?: Array<{ who?: string; text?: string }> },
    @Res() res: Response,
  ) {
    if (!this.tts.enabled) throw new NotImplementedException('text-to-speech is not configured (set TTS_API_KEY)');

    const lines: PodcastLine[] = (Array.isArray(body?.lines) ? body.lines : [])
      .map((l) => ({
        who: String(l?.who || 'maya').toLowerCase(),
        text: String(l?.text || '').trim().slice(0, MAX_LINE_CHARS),
      }))
      .filter((l) => l.text)
      .slice(0, MAX_LINES);
    if (!lines.length) throw new BadRequestException('lines are required');

    const cached = this.tts.isCached(lines);
    if (!cached) {
      await this.usage.checkQuota(userId, 'ai.podcast');
    }

    let audio: Buffer;
    try {
      audio = await this.tts.synthesize(lines);
    } catch (err: any) {
      if (err?.status === 501) throw new NotImplementedException(err.message);
      throw new BadGatewayException(err?.message || 'speech synthesis failed');
    }
    if (!cached) await this.usage.track(userId, 'ai.podcast', { lines: lines.length });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(audio);
  }
}
