/** ExportModule — downloadable vault backup (GET /api/export). */
import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { NotesFileModule } from '../notes/notes-file.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [NotesFileModule, SettingsModule],
  controllers: [ExportController],
})
export class ExportModule {}
