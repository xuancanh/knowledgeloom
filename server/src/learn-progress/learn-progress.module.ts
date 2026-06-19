import { Module } from '@nestjs/common';
import { LearnProgressController } from './learn-progress.controller';
import { LearnProgressRepository } from './learn-progress.repository';

@Module({
  controllers: [LearnProgressController],
  providers: [LearnProgressRepository],
  exports: [LearnProgressRepository],
})
export class LearnProgressModule {}
