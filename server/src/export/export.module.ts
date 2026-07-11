/** ExportModule — downloadable vault backup (GET /api/export). */
import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { NotesFileModule } from '../notes/notes-file.module';
import { SettingsModule } from '../settings/settings.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { RestoreService } from './restore.service';

@Module({
  imports: [NotesFileModule, SettingsModule, KnowledgeModule],
  controllers: [ExportController],
  providers: [RestoreService],
})
export class ExportModule {}
