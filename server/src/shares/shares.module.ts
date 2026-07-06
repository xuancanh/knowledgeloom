/** SharesModule — public read-only share links for notes + their study decks. */
import { Module } from '@nestjs/common';
import { SharesController, PublicSharesController } from './shares.controller';
import { SharesRepository } from './shares.repository';
import { SharePayloadService } from './share-payload.service';
import { NotesFileModule } from '../notes/notes-file.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [NotesFileModule, KnowledgeModule],
  controllers: [SharesController, PublicSharesController],
  providers: [SharesRepository, SharePayloadService],
  exports: [SharesRepository, SharePayloadService],
})
export class SharesModule {}
