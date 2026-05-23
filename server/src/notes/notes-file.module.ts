/**
 * NotesFileModule — provides the filesystem note repository.
 *
 * Kept as a standalone module so it can be imported by KnowledgeModule,
 * CodexModule, and NotesModule without each re-declaring the repository as a
 * provider. Exporting NoteFileRepository makes it injectable in any module
 * that imports NotesFileModule.
 */
import { Module } from '@nestjs/common';
import { NoteFileRepository } from './note-file.repository';

@Module({
  providers: [NoteFileRepository],
  exports: [NoteFileRepository],
})
export class NotesFileModule {}
