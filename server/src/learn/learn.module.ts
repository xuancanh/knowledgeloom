/**
 * LearnModule — note capture endpoint.
 *
 * LearnController coordinates NotesService (direct write) and JobsService
 * (async Codex queue). Both modules are imported to make their services
 * injectable into the controller.
 */
import { Module } from '@nestjs/common';
import { LearnController } from './learn.controller';
import { NotesModule } from '../notes/notes.module';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [NotesModule, JobsModule],
  controllers: [LearnController],
})
export class LearnModule {}
