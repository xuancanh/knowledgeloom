/**
 * ImportModule — POST /api/import: PDF / text / audio → AI knowledge note.
 */
import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { TranscriptionService } from './transcription.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [ImportController],
  providers: [TranscriptionService],
})
export class ImportModule {}
