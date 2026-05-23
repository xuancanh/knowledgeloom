import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

@Injectable()
export class CodexRunnerService {
  private readonly codexCommand: string;
  private readonly timeoutMs: number;
  private readonly rootDir: string;
  private readonly knowledgeDir: string;

  constructor(config: ConfigService) {
    this.codexCommand = config.get<string>('codexCommand');
    this.timeoutMs = config.get<number>('codexTimeoutMs');
    this.rootDir = config.get<string>('rootDir');
    this.knowledgeDir = config.get<string>('knowledgeDir');
  }

  run(prompt: string, outputExtension = 'md'): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputPath = join(
        this.knowledgeDir,
        `.codex-output-${Date.now()}-${Math.random().toString(16).slice(2)}.${outputExtension}`,
      );
      const child = spawn(
        this.codexCommand,
        ['exec', '--skip-git-repo-check', '--cd', this.rootDir, '--output-last-message', outputPath, prompt],
        { cwd: this.rootDir, stdio: ['ignore', 'pipe', 'pipe'], env: process.env },
      );

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Codex exec timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on('error', (err) => { clearTimeout(timer); reject(err); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          rm(outputPath, { force: true }).catch(() => {});
          reject(new Error(stderr || stdout || `Codex exec exited with code ${code}`));
          return;
        }
        readFile(outputPath, 'utf8')
          .then((content) => {
            rm(outputPath, { force: true }).catch(() => {});
            if (content.trim()) resolve(content.trim());
            else reject(new Error(stdout || stderr || 'Codex exec produced no content'));
          })
          .catch((err) => reject(err));
      });
    });
  }
}
