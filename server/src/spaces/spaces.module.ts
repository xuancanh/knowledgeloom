/**
 * SpacesModule — space management endpoints.
 *
 * SpacesRepository itself is provided by the global AuthModule (ApiAuthGuard
 * needs it on every request to validate the x-space-id header), so this
 * module only wires the service + controller. SearchModule is imported for
 * space-deletion index cleanup.
 */
import { Module } from '@nestjs/common';
import { SpacesController } from './spaces.controller';
import { SpacesService } from './spaces.service';
import { SearchModule } from '../search/search.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { NotesFileModule } from '../notes/notes-file.module';
import { RemindersModule } from '../reminders/reminders.module';

@Module({
  imports: [SearchModule, KnowledgeModule, NotesFileModule, RemindersModule],
  controllers: [SpacesController],
  providers: [SpacesService],
})
export class SpacesModule {}
