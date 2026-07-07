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

    // Recover interrupted jobs (were running when the process was killed).
    const running = await this.repo.getRunningJobs();
    for (const job of running) {
      this.logger.log(`Recovering interrupted job on boot: ${job.id}`);
      job.status = 'queued';
      job.nextRunAt = new Date().toISOString();
      await this.repo.save(job);
    }

    // Re-enqueue all queued jobs (includes just-reset running jobs).
    // BullMQ deduplicates by jobId so this is safe even if the job is
    // already in Redis — it returns the existing entry without creating a duplicate.
    const queued = await this.repo.getQueuedJobs();
    for (const job of queued) {
      this.logger.log(`Re-enqueuing queued job on boot: ${job.id}`);
      await this.codexQueue.add('process-job', job, {
        jobId: job.id,
        attempts: job.maxAttempts || this.maxAttempts,
        backoff: {
          type: 'fixed',
          delay: this.retryMs,
        },
      });
    }

    if (queued.length > 0) {
      this.logger.log(`Boot recovery complete: ${queued.length} job(s) re-enqueued`);
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
      // regen-mode fields — must be preserved so the job processor can read them
      noteId: payload.noteId || undefined,
      regenTarget: payload.regenTarget || undefined,
      regenSize: payload.regenSize || undefined,
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

  /**
   * Queue-health summary for the scope: counts by status, how long the oldest
   * unfinished job has been waiting, how many jobs needed a retry, and the most
   * recent failures. Gives monitoring a scrape target for queue depth / job age
   * / retry / failure signals without exposing full payloads.
   */
  async metrics(userId: string): Promise<{
    total: number;
    byStatus: Record<Job['status'], number>;
    pending: number;
    failed: number;
    oldestPendingAgeMs: number;
    retriedJobs: number;
    recentErrors: { id: string; mode: string; error: string; at: string }[];
    generatedAt: string;
  }> {
    const jobs = await this.repo.listAll(userId);
    const now = Date.now();
    const byStatus: Record<Job['status'], number> = { queued: 0, running: 0, done: 0, error: 0 };
    let oldestPendingAgeMs = 0;
    let retriedJobs = 0;
    const recentErrors: { id: string; mode: string; error: string; at: string }[] = [];

    for (const j of jobs) {
      byStatus[j.status] = (byStatus[j.status] ?? 0) + 1;
      if (j.status === 'queued' || j.status === 'running') {
        const age = now - Date.parse(j.createdAt);
        if (Number.isFinite(age) && age > oldestPendingAgeMs) oldestPendingAgeMs = age;
      }
      if ((j.attempts ?? 0) > 1) retriedJobs += 1;
      if (j.status === 'error' && j.error) {
        recentErrors.push({ id: j.id, mode: j.mode, error: j.error.slice(0, 200), at: j.finishedAt || j.createdAt });
      }
    }
    recentErrors.sort((a, b) => (b.at || '').localeCompare(a.at || ''));

    return {
      total: jobs.length,
      byStatus,
      pending: byStatus.queued + byStatus.running,
      failed: byStatus.error,
      oldestPendingAgeMs,
      retriedJobs,
      recentErrors: recentErrors.slice(0, 10),
      generatedAt: new Date().toISOString(),
    };
  }
}
