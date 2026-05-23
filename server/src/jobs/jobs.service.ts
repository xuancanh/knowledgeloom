/**
 * JobsService — durable Codex job queue.
 *
 * Design rationale:
 *  - Jobs are persisted to SQLite so they survive server restarts.
 *  - An in-memory Map mirrors the database for O(1) lookup by id.
 *  - Only one job runs at a time. Serial execution avoids overlapping writes
 *    to markdown files, category indexes, and Meilisearch.
 *  - Failed jobs are retried up to maxAttempts with a configurable delay.
 *    Permanently failed jobs remain visible in the activity rail.
 *
 * Lifecycle:
 *  - onModuleInit()  — loads persisted jobs, normalises interrupted state,
 *    and kicks the queue processor.
 *  - onModuleDestroy() — clears the pending timer so the process exits cleanly.
 *
 * The queue processor is intentionally not an interval; it reschedules itself
 * after each job (or after calculating the next retry delay) to avoid
 * concurrent processing.
 */
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { slugify } from '../common/note-parser.util';
import { JobRepository } from './job.repository';
import { CodexService } from '../codex/codex.service';
import type { Job, JobMode } from '../types';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  /** In-memory mirror of persisted job state. */
  readonly jobs = new Map<string, Job>();

  private activeJobId: string | null = null;
  private queueTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly readOnly: boolean;
  private readonly maxAttempts: number;
  private readonly retryMs: number;

  constructor(
    private readonly repo: JobRepository,
    private readonly codexService: CodexService,
    private readonly config: ConfigService,
  ) {
    this.readOnly = config.get<boolean>('readOnly');
    this.maxAttempts = config.get<number>('codexJobMaxAttempts');
    this.retryMs = config.get<number>('codexJobRetryMs');
  }

  async onModuleInit(): Promise<void> {
    if (this.readOnly) return;
    const persisted = this.repo.listAll();
    for (const job of persisted) {
      // Treat jobs that were mid-flight at shutdown as queued for retry.
      const resumable = job.status === 'running' || (job.status === 'error' && job.attempts < job.maxAttempts);
      this.jobs.set(job.id, {
        ...job,
        status: resumable ? 'queued' : job.status,
        nextRunAt: resumable ? new Date().toISOString() : job.nextRunAt,
      });
    }
    this.saveAll();
    this.scheduleQueue();
  }

  onModuleDestroy(): void {
    if (this.queueTimer) clearTimeout(this.queueTimer);
  }

  /**
   * Adds a new job to the durable queue and schedules immediate processing.
   * Returns the job record so the caller can provide the id to the client.
   */
  async enqueue(payload: any): Promise<Job> {
    const topic = String(payload.topic || payload.title || '').trim();
    const jobId = `${Date.now()}-${slugify(topic)}`;
    const now = new Date().toISOString();
    const job: Job = {
      id: jobId,
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
    this.jobs.set(jobId, job);
    this.repo.save(job);
    this.scheduleQueue();
    return job;
  }

  /**
   * Records a synchronous note creation as a completed activity item.
   * Direct writes do not invoke Codex but are stored in the same job log so
   * the activity rail shows every creation attempt.
   */
  async recordCompleted(payload: any, result: any): Promise<Job> {
    if (this.readOnly) return null as any;
    const topic = String(payload.topic || payload.title || result.note?.title || '').trim();
    const now = new Date().toISOString();
    const job: Job = {
      id: `${Date.now()}-${slugify(topic)}`,
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
    this.jobs.set(job.id, job);
    this.repo.save(job);
    return job;
  }

  /** Schedules or reschedules the queue processor with an optional delay. */
  scheduleQueue(delay = 0): void {
    if (this.readOnly) return;
    if (this.queueTimer) clearTimeout(this.queueTimer);
    this.queueTimer = setTimeout(() => {
      this.queueTimer = null;
      this.processQueue().catch((err: Error) => console.error(`Queue processor failed: ${err.message}`));
    }, delay);
  }

  // ---------------------------------------------------------------------------
  // Private queue processing
  // ---------------------------------------------------------------------------

  private async processQueue(): Promise<void> {
    if (this.activeJobId) return;
    const job = this.nextQueuedJob();
    if (!job) {
      const delay = this.nextQueuedDelay();
      if (delay !== null) this.scheduleQueue(delay);
      return;
    }

    this.activeJobId = job.id;
    this.mutate(job.id, { status: 'running', attempts: job.attempts + 1, startedAt: new Date().toISOString(), error: null });

    try {
      const result = await this.codexService.createNote(this.jobs.get(job.id)!);
      this.mutate(job.id, { status: 'done', finishedAt: new Date().toISOString(), nextRunAt: null, ...result });
    } catch (err: any) {
      const current = this.jobs.get(job.id)!;
      const canRetry = current.attempts < current.maxAttempts;
      this.mutate(job.id, {
        status: canRetry ? 'queued' : 'error',
        error: err.message,
        finishedAt: canRetry ? null : new Date().toISOString(),
        nextRunAt: canRetry ? new Date(Date.now() + this.retryMs).toISOString() : null,
      });
    } finally {
      this.activeJobId = null;
      this.saveAll();
      this.scheduleQueue();
    }
  }

  private mutate(id: string, patch: Partial<Job>): void {
    const current = this.jobs.get(id)!;
    const updated = { ...current, ...patch } as Job;
    this.jobs.set(id, updated);
    this.repo.save(updated);
  }

  private saveAll(): void {
    this.repo.replaceAll(
      [...this.jobs.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  }

  private nextQueuedJob(): Job | null {
    const now = Date.now();
    return (
      [...this.jobs.values()]
        .filter((j) => j.status === 'queued' && Date.parse(j.nextRunAt || j.createdAt) <= now)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] || null
    );
  }

  private nextQueuedDelay(): number | null {
    const queued = [...this.jobs.values()].filter((j) => j.status === 'queued');
    if (!queued.length) return null;
    const next = Math.min(...queued.map((j) => Date.parse(j.nextRunAt || j.createdAt)));
    return Math.max(0, next - Date.now());
  }
}
