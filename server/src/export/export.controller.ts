/**
 * ExportController — a portable, dependency-free backup of the caller's vault.
 *
 * GET /api/export streams a downloadable JSON bundle of every note's markdown
 * (the source of truth) from the active space plus account-level settings.
 * Self-hosters can also just copy the markdown tree; this endpoint is what makes
 * a hosted / S3-backed vault exportable and gives everyone a one-click backup.
 *
 * POST /api/export/restore validates and restores the same portable format.
 */
import {
  BadRequestException, Body, Controller, Get, Post, Res, UploadedFile,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { NoteFileRepository } from '../notes/note-file.repository';
import { UserSettingsRepository } from '../settings/user-settings.repository';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentScope } from '../auth/current-scope.decorator';
import { WritableGuard } from '../common/guards/writable.guard';
import { ownerOf } from '../spaces/scope.util';
import { EXPORT_FORMAT } from './export.constants';
import { parseRestoreBundle, RestoreService, type RestoreConflictPolicy } from './restore.service';

const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

@Controller('api/export')
@UseGuards(ApiAuthGuard)
export class ExportController {
  constructor(
    private readonly notes: NoteFileRepository,
    private readonly settings: UserSettingsRepository,
    private readonly restoreService: RestoreService,
  ) {}

  @Get()
  async export(@CurrentScope() userId: string, @Res() res: Response): Promise<void> {
    const sources = await this.notes.readAllSources(userId);
    const settings = await this.settings.get(ownerOf(userId));
    const bundle = {
      format: EXPORT_FORMAT,
      exportedAt: new Date().toISOString(),
      noteCount: sources.length,
      notes: sources.map((s) => ({ file: s.file, markdown: s.markdown })),
      settings,
    };
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="knowledge-loom-backup-${stamp}.json"`);
    res.send(JSON.stringify(bundle, null, 2));
  }

  @Post('restore')
  @UseGuards(WritableGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BACKUP_BYTES, files: 1 } }))
  async restore(
    @CurrentScope() userId: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @Body() body: Record<string, string>,
  ) {
    if (!file) throw new BadRequestException('backup file is required');
    if (!file.originalname.toLowerCase().endsWith('.json')) throw new BadRequestException('backup must be a .json file');
    const policy = String(body.policy || 'skip') as RestoreConflictPolicy;
    if (!['skip', 'overwrite', 'rename'].includes(policy)) throw new BadRequestException('invalid conflict policy');
    const bundle = parseRestoreBundle(file.buffer.toString('utf8'));
    return this.restoreService.restore(userId, bundle, {
      policy,
      dryRun: body.dryRun === '1' || body.dryRun === 'true',
      restoreSettings: body.restoreSettings === '1' || body.restoreSettings === 'true',
    });
  }
}
