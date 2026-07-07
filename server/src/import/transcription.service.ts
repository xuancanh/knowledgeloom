/**
 * TranscriptionService — turns uploaded audio into text for the import pipeline.
 *
 * Providers (TRANSCRIBE_PROVIDER):
 *   'openai' — any Whisper-compatible HTTP API (POST {base}/audio/transcriptions).
 *              Works with OpenAI, Groq, local faster-whisper servers, etc.
 *   'cli'    — a local command template (TRANSCRIBE_COMMAND, "{file}" placeholder)
 *              that prints the transcript to stdout, e.g. whisper.cpp.
 *   'none'   — audio import disabled (default when no key is configured).
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Cap on transcript bytes buffered from a CLI processor — a runaway or hostile
 *  command can't exhaust memory before the size or time limit trips. */
const MAX_CLI_OUTPUT_BYTES = 5 * 1024 * 1024; // 5 MB of text

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(private readonly config: ConfigService) {}

  private get timeoutMs(): number {
    return this.config.get<number>('transcribeTimeoutMs') || 120000;
  }

  get enabled(): boolean {
    return this.config.get<string>('transcribeProvider') !== 'none';
  }

  async transcribe(file: { originalname: string; buffer: Buffer; mimetype: string }): Promise<string> {
    const provider = this.config.get<string>('transcribeProvider');
    if (provider === 'openai') return this.viaApi(file);
    if (provider === 'cli') return this.viaCli(file);
    throw Object.assign(new Error('audio transcription is not configured (set TRANSCRIBE_API_KEY or TRANSCRIBE_COMMAND)'), { status: 501 });
  }

  private async viaApi(file: { originalname: string; buffer: Buffer; mimetype: string }): Promise<string> {
    const base = (this.config.get<string>('transcribeApiBase') || '').replace(/\/$/, '');
    const key = this.config.get<string>('transcribeApiKey');
    const form = new FormData();
    form.append('model', this.config.get<string>('transcribeModel'));
    form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'audio');
    form.append('response_format', 'json');

    const res = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: key ? { authorization: `Bearer ${key}` } : {},
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.logger.warn(`transcription API ${res.status}: ${text.slice(0, 200)}`);
      throw Object.assign(new Error(`transcription failed (${res.status})`), { status: 502 });
    }
    const json: any = await res.json();
    const transcript = String(json.text || '').trim();
    if (!transcript) throw Object.assign(new Error('transcription returned no text'), { status: 502 });
    return transcript;
  }

  private async viaCli(file: { originalname: string; buffer: Buffer }): Promise<string> {
    const template = this.config.get<string>('transcribeCommand');
    if (!template) throw Object.assign(new Error('TRANSCRIBE_COMMAND is not set'), { status: 501 });

    const dir = await mkdtemp(join(tmpdir(), 'kl-audio-'));
    const ext = (file.originalname.match(/\.[A-Za-z0-9]+$/) || ['.bin'])[0];
    const path = join(dir, `input${ext}`);
    await writeFile(path, file.buffer);

    try {
      const [cmd, ...args] = template.split(/\s+/).map((part) => part.replaceAll('{file}', path));
      return await new Promise<string>((resolvePromise, reject) => {
        const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        let overflowed = false;
        // Kill a hung/slow processor rather than let the request hang forever.
        const timer = setTimeout(() => {
          proc.kill('SIGKILL');
          reject(Object.assign(new Error('transcription command timed out'), { status: 504 }));
        }, this.timeoutMs);
        proc.stdout.on('data', (d) => {
          out += d;
          if (out.length > MAX_CLI_OUTPUT_BYTES) { overflowed = true; proc.kill('SIGKILL'); }
        });
        proc.stderr.on('data', (d) => { if (err.length < 4096) err += d; });
        proc.on('error', (e) => { clearTimeout(timer); reject(e); });
        proc.on('close', (code) => {
          clearTimeout(timer);
          if (overflowed) reject(Object.assign(new Error('transcription output exceeded size limit'), { status: 502 }));
          else if (code === 0 && out.trim()) resolvePromise(out.trim());
          else reject(Object.assign(new Error(`transcription command failed (${code}): ${err.slice(0, 200)}`), { status: 502 }));
        });
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
