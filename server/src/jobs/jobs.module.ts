/**
 * JobsModule — durable Codex job queue.
 *
 * JobRepository uses DRIZZLE_DB from the global DatabaseModule.
 * JobsService depends on CodexService to run the actual Codex CLI.
 * Exports JobsService so LearnModule can enqueue and record jobs.
 */
import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobRepository } from './job.repository';
import { CodexModule } from '../codex/codex.module';

@Module({
  imports: [CodexModule],
  controllers: [JobsController],
  providers: [JobsService, JobRepository],
  exports: [JobsService],
})
export class JobsModule {}
