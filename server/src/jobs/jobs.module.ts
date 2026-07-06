/**
 * JobsModule — durable Codex job queue.
 *
 * JobRepository uses DRIZZLE_DB from the global DatabaseModule.
 * JobsService depends on CodexService to run the actual Codex CLI.
 * Exports JobsService so LearnModule can enqueue and record jobs.
 */
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { JobRepository } from './job.repository';
import { JobsProcessor } from './jobs.processor';
import { CodexModule } from '../codex/codex.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [
    CodexModule,
    KnowledgeModule,
    BullModule.registerQueue({
      name: 'codex-jobs',
    }),
  ],
  controllers: [JobsController],
  providers: [
    JobsService,
    JobRepository,
    // SKIP_JOBS=1 boots without Redis: AppModule omits BullModule.forRoot,
    // so the worker (which demands a connection at construction) must be
    // omitted too. Queues stay registered — enqueueing simply fails until
    // Redis exists, which is the documented degraded mode.
    ...(process.env.SKIP_JOBS === '1' ? [] : [JobsProcessor]),
  ],
  exports: [JobsService],
})
export class JobsModule {}
