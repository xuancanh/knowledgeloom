/**
 * RemindersService — business logic for note reminders.
 *
 * Reminders are simple scheduled alerts tied to individual notes. This service
 * validates input (future date, required noteId), computes derived state
 * (completedAt), and delegates persistence to ReminderRepository.
 *
 * All validation errors use NestJS built-in HTTP exceptions so the global
 * exception filter converts them to consistent JSON responses.
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

  list(opts: { noteId?: string; status?: string } = {}): Reminder[] {
    return this.repo.list(opts);
  }

  create({ noteId, remindAt, message }: any): Reminder {
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
    this.repo.insert(reminder);
    return reminder;
  }

  patch(id: string, updates: any): Reminder {
    this.assertWritable();
    const existing = this.repo.findById(id);
    if (!existing) throw new NotFoundException('reminder not found');

    const completedAt =
      updates.completed === true
        ? new Date().toISOString()
        : updates.completed === false
          ? null
          : existing.completedAt;

    const remindAt = updates.remindAt ? this.normalizeRemindAt(updates.remindAt) : existing.remindAt;
    const message = updates.message === undefined ? existing.message : String(updates.message || '').trim();

    this.repo.update(id, { remindAt, message, completedAt });
    return this.repo.findById(id)!;
  }

  remove(id: string): { deleted: string } {
    this.assertWritable();
    if (!this.repo.remove(id)) throw new NotFoundException('reminder not found');
    return { deleted: id };
  }

  /** Called when a note is deleted to clean up orphaned reminders. */
  removeForNote(noteId: string): void {
    if (this.readOnly) return;
    this.repo.removeForNote(noteId);
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
