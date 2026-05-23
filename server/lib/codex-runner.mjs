import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { CODEX_COMMAND, CODEX_TIMEOUT_MS, knowledgeDir, rootDir } from './config.mjs';

/**
 * Runs `codex exec` and returns only the final assistant message.
 *
 * Multiple backend features use Codex as an asynchronous worker. Keeping the
 * process runner in one module avoids copying timeout, output-file, and cleanup
 * behavior across note generation, AI edits, and flashcard generation.
 */
export function runCodex(prompt, { outputExtension = 'md' } = {}) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(knowledgeDir, `.codex-output-${Date.now()}-${Math.random().toString(16).slice(2)}.${outputExtension}`);
    const child = spawn(CODEX_COMMAND, [
      'exec',
      '--skip-git-repo-check',
      '--cd',
      rootDir,
      '--output-last-message',
      outputPath,
      prompt,
    ], {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Codex exec timed out after ${CODEX_TIMEOUT_MS}ms`));
    }, CODEX_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
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
        .catch((error) => reject(error));
    });
  });
}
