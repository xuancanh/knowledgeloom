import { Module } from '@nestjs/common';
import { LearnProgressController } from './learn-progress.controller';
import { LearnProgressRepository } from './learn-progress.repository';
import { AiModule } from '../ai/ai.module';
import { NotesModule } from '../notes/notes.module';

@Module({
  imports: [AiModule, NotesModule],
  controllers: [LearnProgressController],
  providers: [LearnProgressRepository],
  exports: [LearnProgressRepository],
})
export class LearnProgressModule {}
