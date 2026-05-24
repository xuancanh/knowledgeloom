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
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('api/jobs')
@UseGuards(SupabaseAuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async listJobs(@CurrentUser() userId: string) {
    return { jobs: await this.jobsService.listAll(userId) };
  }

  @Get(':id')
  async getJob(@CurrentUser() userId: string, @Param('id') id: string) {
    const job = await this.jobsService.getJob(userId, id);
    if (!job) throw new NotFoundException('job not found');
    return job;
  }
}
