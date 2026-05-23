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
  async list(@Query('noteId') noteId?: string, @Query('status') status?: string) {
    return { reminders: await this.remindersService.list({ noteId, status }) };
  }

  @Post()
  @UseGuards(WritableGuard)
  async create(@Body() body: any) {
    return { reminder: await this.remindersService.create(body || {}) };
  }

  @Patch(':id')
  @UseGuards(WritableGuard)
  async patch(@Param('id') id: string, @Body() body: any) {
    return { reminder: await this.remindersService.patch(id, body || {}) };
  }

  @Delete(':id')
  @UseGuards(WritableGuard)
  async remove(@Param('id') id: string) {
    return this.remindersService.remove(id);
  }
}
