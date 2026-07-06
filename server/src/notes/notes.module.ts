/**
 * NotesModule — individual note CRUD.
 *
 * Aggregates the full dependency graph needed for note mutations:
 *  - NotesFileModule  → NoteFileRepository (filesystem read/write)
 *  - KnowledgeModule  → KnowledgeService (post-mutation rebuild)
 *  - RemindersModule  → RemindersService (cleanup on delete)
 *  - SearchModule     → SearchService (explicit Meilisearch delete)
 *  - CodexModule      → CodexService (inline editor assistant)
 *
 * Exports NotesService so LearnModule can call createFromDraft() for direct
 * note creation without going through the HTTP layer.
 */
import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { NotesFileModule } from './notes-file.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { RemindersModule } from '../reminders/reminders.module';
import { SearchModule } from '../search/search.module';
import { CodexModule } from '../codex/codex.module';
import { JobsModule } from '../jobs/jobs.module';
import { NoteReadsModule } from './note-reads.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [NotesFileModule, KnowledgeModule, RemindersModule, SearchModule, CodexModule, JobsModule, NoteReadsModule, SettingsModule],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
