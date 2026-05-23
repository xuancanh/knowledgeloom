import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { CodexService } from '../codex/codex.service';
import { JobRepository } from './job.repository';
import type { Job as CodexJob } from '../types';

@Processor('codex-jobs', { concurrency: 1 })
export class JobsProcessor extends WorkerHost {
  private readonly logger = new Logger(JobsProcessor.name);

  constructor(
    private readonly codexService: CodexService,
    private readonly repo: JobRepository,
  ) {
    super();
  }

  async process(job: Job<CodexJob, unknown, string>): Promise<unknown> {
    const codexJob = job.data;
    this.logger.log(`Starting job: ${codexJob.id} (${codexJob.mode})`);

    // Update job status in SQLite to 'running'
    codexJob.status = 'running';
    // attemptsMade starts at 1 for the first attempt in BullMQ.
    // In our types,attempts count runs from 1 onwards.
    codexJob.attempts = job.attemptsMade;
    codexJob.startedAt = new Date().toISOString();
    codexJob.error = null;
    await this.repo.save(codexJob);

    try {
      const result = await this.codexService.createNote(codexJob);

      // Update job status in SQLite to 'done'
      codexJob.status = 'done';
      codexJob.finishedAt = new Date().toISOString();
      codexJob.nextRunAt = null;

      // Merge result details (like result.note, result.state, result.codexStatus)
      const updatedJob = { ...codexJob, ...result };
      await this.repo.save(updatedJob);
      this.logger.log(`Completed job: ${codexJob.id}`);
      return result;
    } catch (err) {
      const error = err as Error;
      this.logger.error(`Job failed: ${codexJob.id} - ${error.message}`);

      const attemptsLimit = job.opts.attempts || 3;
      const isLastAttempt = job.attemptsMade >= attemptsLimit;
      codexJob.status = isLastAttempt ? 'error' : 'queued';
      codexJob.error = error.message;
      codexJob.finishedAt = isLastAttempt ? new Date().toISOString() : null;

      // Sync attempts count
      codexJob.attempts = job.attemptsMade;

      // Approximate nextRunAt for UI using backoff delay configuration
      if (!isLastAttempt && job.opts.backoff) {
        const backoffDelay = typeof job.opts.backoff === 'number'
          ? job.opts.backoff
          : (job.opts.backoff as { delay?: number }).delay || 60000;
        codexJob.nextRunAt = new Date(Date.now() + backoffDelay).toISOString();
      } else {
        codexJob.nextRunAt = null;
      }

      await this.repo.save(codexJob);
      throw err; // Let BullMQ handle the failure/retry
    }
  }
}
