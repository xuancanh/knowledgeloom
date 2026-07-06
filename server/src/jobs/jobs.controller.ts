/**
 * JobsController — exposes the Codex job queue to the frontend activity rail.
 *
 * GET /api/jobs      — all jobs for the authenticated user
 * GET /api/jobs/:id  — single job for polling status while a job runs
 *
 * Jobs are read-only from the HTTP layer; mutations come from LearnController
 * (enqueue) and JobsService (internal state transitions).
 *
 * All routes require authentication.
 */
import { Controller, Get, Param, NotFoundException, UseGuards } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentScope } from '../auth/current-scope.decorator';

@Controller('api/jobs')
@UseGuards(ApiAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async listJobs(@CurrentScope() userId: string) {
    return { jobs: await this.jobsService.listAll(userId) };
  }

  @Get(':id')
  async getJob(@CurrentScope() userId: string, @Param('id') id: string) {
    const job = await this.jobsService.getJob(userId, id);
    if (!job) throw new NotFoundException('job not found');
    return job;
  }
}
