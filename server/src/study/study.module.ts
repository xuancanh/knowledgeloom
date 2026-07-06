/**
 * StudyModule — the unified "Today" study queue (GET /api/study/today).
 * Composes existing data: enriched knowledge state + active reminders.
 */
import { Module } from '@nestjs/common';
import { StudyController } from './study.controller';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [KnowledgeModule, RemindersModule],
  controllers: [StudyController],
})
export class StudyModule {}
