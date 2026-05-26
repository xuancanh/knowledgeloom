import { Module } from '@nestjs/common';
import { NoteReadsRepository } from './note-reads.repository';

@Module({
  providers: [NoteReadsRepository],
  exports: [NoteReadsRepository],
})
export class NoteReadsModule {}
