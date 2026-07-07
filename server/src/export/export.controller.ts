/**
 * ExportController — a portable, dependency-free backup of the caller's vault.
 *
 * GET /api/export streams a downloadable JSON bundle of every note's markdown
 * (the source of truth) plus the user's settings, scoped to the active space.
 * Self-hosters can also just copy the markdown tree; this endpoint is what makes
 * a hosted / S3-backed vault exportable and gives everyone a one-click backup.
 *
 * Restore (re-importing a bundle with conflict handling) is a separate, larger
 * follow-up — export is intentionally shipped first so a backup always exists.
 */
import { Controller, Get, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { NoteFileRepository } from '../notes/note-file.repository';
import { UserSettingsRepository } from '../settings/user-settings.repository';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentScope } from '../auth/current-scope.decorator';

export const EXPORT_FORMAT = 'knowledge-loom-export/v1';

@Controller('api/export')
@UseGuards(ApiAuthGuard)
export class ExportController {
  constructor(
    private readonly notes: NoteFileRepository,
    private readonly settings: UserSettingsRepository,
  ) {}

  @Get()
  async export(@CurrentScope() userId: string, @Res() res: Response): Promise<void> {
    const sources = await this.notes.readAllSources(userId);
    const settings = await this.settings.get(userId);
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
}
