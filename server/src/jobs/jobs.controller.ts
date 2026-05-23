/**
 * JobsController — exposes the Codex job queue to the frontend activity rail.
 *
 * GET /api/jobs      — all jobs (sorted by creation time in JobsService)
 * GET /api/jobs/:id  — single job for polling status while a job runs
 *
 * Jobs are read-only from the HTTP layer; mutations come from LearnController
 * (enqueue) and JobsService (internal state transitions).
 */
import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';

@Controller('api/jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async listJobs() {
    return { jobs: await this.jobsService.listAll() };
  }

  @Get(':id')
  async getJob(@Param('id') id: string) {
    const job = await this.jobsService.getJob(id);
    if (!job) throw new NotFoundException('job not found');
    return job;
  }
}
