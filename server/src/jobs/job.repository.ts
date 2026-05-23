/**
 * JobRepository — Drizzle ORM access layer for the jobs table.
 *
 * Jobs are stored with first-class scheduler columns (status, nextRunAt,
 * attempts) so the queue processor can filter efficiently without JSON parsing.
 * The complete job payload is also serialised as a JSON blob for forward
 * compatibility — new fields on the Job interface do not require migrations.
 */
import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { asc, eq } from 'drizzle-orm';
import { DrizzleDb } from '../database/database.module';
import { DRIZZLE_DB, JOBS_TABLE } from '../database/database.constants';
import type { Job } from '../types';

@Injectable()
export class JobRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    @Inject(JOBS_TABLE) private readonly jobsTable: any,
    private readonly config: ConfigService,
  ) {}

  async listAll(): Promise<Job[]> {
    if (this.config.get<boolean>('readOnly') || !this.db) return [];
    const rows = await this.db
      .select()
      .from(this.jobsTable)
      .orderBy(asc(this.jobsTable.createdAt));
    return rows.map((row: any) => JSON.parse(row.payload));
  }

  async findById(id: string): Promise<Job | null> {
    if (!this.db) return null;
    const rows = await this.db
      .select()
      .from(this.jobsTable)
      .where(eq(this.jobsTable.id, id))
      .limit(1);
    const row = rows[0];
    return row ? JSON.parse(row.payload) : null;
  }

  async getRunningJobs(): Promise<Job[]> {
    if (!this.db) return [];
    const rows = await this.db
      .select()
      .from(this.jobsTable)
      .where(eq(this.jobsTable.status, 'running'));
    return rows.map((row: any) => JSON.parse(row.payload));
  }

  /** Upserts one job. Called after every state transition. */
  async save(job: Job): Promise<void> {
    if (!this.db) return;
    const row = this.bind(job);
    await this.db
      .insert(this.jobsTable)
      .values(row)
      .onConflictDoUpdate({
        target: this.jobsTable.id,
        set: {
          status: row.status,
          mode: row.mode,
          topic: row.topic,
          attempts: row.attempts,
          maxAttempts: row.maxAttempts,
          createdAt: row.createdAt,
          startedAt: row.startedAt,
          finishedAt: row.finishedAt,
          nextRunAt: row.nextRunAt,
          error: row.error,
          payload: row.payload,
        },
      });
  }

  private bind(job: Job) {
    return {
      id: String(job.id),
      status: String(job.status || 'queued'),
      mode: String(job.mode || 'research'),
      topic: String(job.topic || ''),
      attempts: Number(job.attempts || 0),
      maxAttempts: Number(job.maxAttempts || 0),
      createdAt: String(job.createdAt || new Date().toISOString()),
      startedAt: job.startedAt || null,
      finishedAt: job.finishedAt || null,
      nextRunAt: job.nextRunAt || null,
      error: job.error || null,
      payload: JSON.stringify(job),
    };
  }
}
