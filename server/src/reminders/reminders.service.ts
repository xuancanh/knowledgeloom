/**
 * RemindersService — business logic for note reminders.
 *
 * Reminders are simple scheduled alerts tied to individual notes. This service
 * validates input (future date, required noteId), computes derived state
 * (completedAt), and delegates persistence to ReminderRepository.
 *
 * All methods require a userId and filter exclusively on that user's reminders.
 */
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { ReminderRepository } from './reminder.repository';
import type { Reminder } from '../types';

@Injectable()
export class RemindersService {
  private readonly readOnly: boolean;

  constructor(
    private readonly repo: ReminderRepository,
    private readonly config: ConfigService,
  ) {
    this.readOnly = config.get<boolean>('readOnly');
  }

  async list(userId: string, opts: { noteId?: string; status?: string } = {}): Promise<Reminder[]> {
    return this.repo.list(userId, opts);
  }

  async create(userId: string, { noteId, remindAt, message }: any): Promise<Reminder> {
    this.assertWritable();
    const cleanNoteId = basename(String(noteId || '').trim());
    if (!cleanNoteId) throw new BadRequestException('noteId is required');

    const now = new Date().toISOString();
    const reminder: Reminder = {
      id: randomUUID(),
      noteId: cleanNoteId,
      remindAt: this.normalizeRemindAt(remindAt),
      message: String(message || '').trim(),
      createdAt: now,
      completedAt: null,
    };
    await this.repo.insert(userId, reminder);
    return reminder;
  }

  async patch(userId: string, id: string, updates: any): Promise<Reminder> {
    this.assertWritable();
    const existing = await this.repo.findById(userId, id);
    if (!existing) throw new NotFoundException('reminder not found');

    const completedAt =
      updates.completed === true
        ? new Date().toISOString()
        : updates.completed === false
          ? null
          : existing.completedAt;

    const remindAt = updates.remindAt ? this.normalizeRemindAt(updates.remindAt) : existing.remindAt;
    const message = updates.message === undefined ? existing.message : String(updates.message || '').trim();

    await this.repo.update(userId, id, { remindAt, message, completedAt });
    const updated = await this.repo.findById(userId, id);
    return updated!;
  }

  async remove(userId: string, id: string): Promise<{ deleted: string }> {
    this.assertWritable();
    const removed = await this.repo.remove(userId, id);
    if (!removed) throw new NotFoundException('reminder not found');
    return { deleted: id };
  }

  /** Called when a note is deleted to clean up orphaned reminders. */
  async removeForNote(userId: string, noteId: string): Promise<void> {
    if (this.readOnly) return;
    await this.repo.removeForNote(userId, noteId);
  }

  private normalizeRemindAt(value: unknown): string {
    const parsed = new Date(String(value || ''));
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('valid remindAt is required');
    if (parsed.getTime() <= Date.now()) throw new BadRequestException('remindAt must be in the future');
    return parsed.toISOString();
  }

  private assertWritable(): void {
    if (this.readOnly) throw new ForbiddenException('service is running in read-only mode');
  }
}
