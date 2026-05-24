/**
 * RemindersController — CRUD for note reminders.
 *
 * All routes require authentication. Write operations are also guarded by
 * WritableGuard which returns 403 in read-only cloud deployments.
 * Results are scoped to the authenticated user.
 */
import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { WritableGuard } from '../common/guards/writable.guard';

@Controller('api/reminders')
@UseGuards(SupabaseAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  async list(
    @CurrentUser() userId: string,
    @Query('noteId') noteId?: string,
    @Query('status') status?: string,
  ) {
    return { reminders: await this.remindersService.list(userId, { noteId, status }) };
  }

  @Post()
  @UseGuards(WritableGuard)
  async create(@CurrentUser() userId: string, @Body() body: any) {
    return { reminder: await this.remindersService.create(userId, body || {}) };
  }

  @Patch(':id')
  @UseGuards(WritableGuard)
  async patch(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: any) {
    return { reminder: await this.remindersService.patch(userId, id, body || {}) };
  }

  @Delete(':id')
  @UseGuards(WritableGuard)
  async remove(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.remindersService.remove(userId, id);
  }
}
