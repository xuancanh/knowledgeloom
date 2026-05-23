/**
 * RemindersController — CRUD for note reminders.
 *
 * All write operations are guarded by WritableGuard which returns 403 in
 * read-only cloud deployments. The guard is applied per-route (not globally)
 * so the GET endpoints remain accessible everywhere.
 */
import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { RemindersService } from './reminders.service';
import { WritableGuard } from '../common/guards/writable.guard';

@Controller('api/reminders')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get()
  list(@Query('noteId') noteId?: string, @Query('status') status?: string) {
    return { reminders: this.remindersService.list({ noteId, status }) };
  }

  @Post()
  @UseGuards(WritableGuard)
  create(@Body() body: any) {
    return { reminder: this.remindersService.create(body || {}) };
  }

  @Patch(':id')
  @UseGuards(WritableGuard)
  patch(@Param('id') id: string, @Body() body: any) {
    return { reminder: this.remindersService.patch(id, body || {}) };
  }

  @Delete(':id')
  @UseGuards(WritableGuard)
  remove(@Param('id') id: string) {
    return this.remindersService.remove(id);
  }
}
