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
import { DRIZZLE_DB } from '../database/database.constants';
import { jobs as jobsTable } from '../database/schema';
import type { Job } from '../types';

@Injectable()
export class JobRepository {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
  ) {}

  listAll(): Job[] {
    if (this.config.get<boolean>('readOnly') || !this.db) return [];
    return this.db
      .select()
      .from(jobsTable)
      .orderBy(asc(jobsTable.createdAt))
      .all()
      .map((row) => JSON.parse(row.payload));
  }

  /** Upserts one job. Called after every state transition. */
  save(job: Job): void {
    if (!this.db) return;
    const row = this.bind(job);
    this.db
      .insert(jobsTable)
      .values(row)
      .onConflictDoUpdate({
        target: jobsTable.id,
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
      })
      .run();
  }

  /** Replaces all rows atomically (used after boot-time queue normalisation). */
  replaceAll(jobs: Job[]): void {
    if (!this.db) return;
    this.db.transaction((tx) => {
      tx.delete(jobsTable).run();
      for (const job of jobs) {
        tx.insert(jobsTable).values(this.bind(job)).run();
      }
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
