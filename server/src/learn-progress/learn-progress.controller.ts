import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { LearnProgressRepository } from './learn-progress.repository';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('api/learn-progress')
@UseGuards(SupabaseAuthGuard)
export class LearnProgressController {
  constructor(private readonly repo: LearnProgressRepository) {}

  @Get()
  get(@CurrentUser() userId: string) {
    return this.repo.get(userId);
  }

  @Post('award')
  award(@CurrentUser() userId: string, @Body() body: { xp: number }) {
    const amount = Math.max(0, Math.min(1000, Number(body?.xp) || 0));
    return this.repo.award(userId, amount);
  }

  @Post('master/:noteId')
  master(@CurrentUser() userId: string, @Param('noteId') noteId: string) {
    return this.repo.master(userId, noteId);
  }
}
