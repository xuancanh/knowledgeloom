/**
 * CodexRunnerModule — provides the low-level Codex CLI process runner.
 *
 * Separated from CodexModule so FlashcardsModule can consume CodexRunnerService
 * without pulling in CodexService (which depends on KnowledgeModule, which
 * depends on FlashcardsModule — a circular chain). Splitting the runner into
 * its own module breaks that cycle cleanly.
 */
import { Module } from '@nestjs/common';
import { CodexRunnerService } from './codex-runner.service';

@Module({
  providers: [CodexRunnerService],
  exports: [CodexRunnerService],
})
export class CodexRunnerModule {}
