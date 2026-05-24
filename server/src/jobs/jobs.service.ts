/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * JobsService — durable Codex job queue using BullMQ.
 *
 * Design rationale:
 *  - Jobs are persisted to SQLite so they survive server restarts and populate the UI history.
 *  - BullMQ/Redis manages the active scheduling, delays, retries, and sequential execution.
 *  - In-memory job state caching is removed to prevent memory leaks in long-running processes.
 *  - Satisfies the single job serialization constraint by configuring Worker concurrency to 1.
 *
 * All user-facing methods require a userId to scope results correctly.
 */
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { slugify } from '../common/note-parser.util';
import { JobRepository } from './job.repository';
import type { Job, JobMode } from '../types';

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger(JobsService.name);
  private readonly readOnly: boolean;
  private readonly maxAttempts: number;
  private readonly retryMs: number;

  constructor(
    @InjectQueue('codex-jobs') private readonly codexQueue: Queue,
    private readonly repo: JobRepository,
    private readonly config: ConfigService,
  ) {
    this.readOnly = config.get<boolean>('readOnly') || false;
    this.maxAttempts = config.get<number>('codexJobMaxAttempts') || 3;
    this.retryMs = config.get<number>('codexJobRetryMs') || 60000;
  }

  async onModuleInit(): Promise<void> {
    if (this.readOnly) return;

    // Reset jobs in SQLite that were running when the process was killed,
    // and re-enqueue them to BullMQ if necessary.
    const running = await this.repo.getRunningJobs();
    for (const job of running) {
      this.logger.log(`Recovering interrupted job on boot: ${job.id}`);
      job.status = 'queued';
      job.nextRunAt = new Date().toISOString();
      await this.repo.save(job);

      // Re-add to BullMQ queue so it gets processed
      await this.codexQueue.add('process-job', job, {
        jobId: job.id,
        attempts: job.maxAttempts || this.maxAttempts,
        backoff: {
          type: 'fixed',
          delay: this.retryMs,
        },
      });
    }
  }

  /**
   * Adds a new job to the durable queue and schedules immediate processing.
   * Returns the job record so the caller can provide the id to the client.
   */
  async enqueue(userId: string, payload: any): Promise<Job> {
    const topic = String(payload.topic || payload.title || '').trim();
    const jobId = `${Date.now()}-${slugify(topic)}`;
    const now = new Date().toISOString();
    const job: Job = {
      id: jobId,
      userId,
      status: 'queued',
      mode: (payload.mode as JobMode) || 'research',
      topic,
      context: payload.context || '',
      body: payload.body || '',
      url: payload.url || '',
      category: payload.category || '',
      summary: payload.summary || '',
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      links: Array.isArray(payload.links) ? payload.links : [],
      guidance: payload.guidance || '',
      attempts: 0,
      maxAttempts: this.maxAttempts,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      nextRunAt: now,
      error: null,
    };

    await this.repo.save(job);

    if (!this.readOnly) {
      await this.codexQueue.add('process-job', job, {
        jobId: job.id,
        attempts: this.maxAttempts,
        backoff: {
          type: 'fixed',
          delay: this.retryMs,
        },
      });
      this.logger.log(`Enqueued Codex job to BullMQ: ${job.id}`);
    }

    return job;
  }

  /**
   * Records a synchronous note creation as a completed activity item.
   * Direct writes do not invoke Codex but are stored in the same job log so
   * the activity rail shows every creation attempt.
   */
  async recordCompleted(userId: string, payload: any, result: any): Promise<Job> {
    if (this.readOnly) return null as any;
    const topic = String(payload.topic || payload.title || result.note?.title || '').trim();
    const now = new Date().toISOString();
    const job: Job = {
      id: `${Date.now()}-${slugify(topic)}`,
      userId,
      status: 'done',
      mode: (payload.mode as JobMode) || 'write',
      topic,
      context: payload.context || '',
      url: payload.url || '',
      category: payload.category || '',
      summary: payload.summary || '',
      tags: Array.isArray(payload.tags) ? payload.tags : [],
      links: Array.isArray(payload.links) ? payload.links : [],
      attempts: 0,
      maxAttempts: 0,
      createdAt: now,
      startedAt: now,
      finishedAt: now,
      nextRunAt: null,
      error: null,
      ...result,
    };
    await this.repo.save(job);
    return job;
  }

  /**
   * Returns all historical jobs for the given user from database.
   */
  async listAll(userId: string): Promise<Job[]> {
    return this.repo.listAll(userId);
  }

  /**
   * Returns a single job by id for the given user from database.
   */
  async getJob(userId: string, id: string): Promise<Job | null> {
    return this.repo.findById(userId, id);
  }
}
