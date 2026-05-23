/**
 * NotesFileModule — provides the note repository backed by NoteStorageProvider.
 *
 * Imports StorageModule to make NOTE_STORAGE injectable into NoteFileRepository.
 * Exporting NoteFileRepository makes it available to KnowledgeModule,
 * CodexModule, and NotesModule without each re-declaring it as a provider.
 */
import { Module } from '@nestjs/common';
import { NoteFileRepository } from './note-file.repository';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [NoteFileRepository],
  exports: [NoteFileRepository],
})
export class NotesFileModule {}
