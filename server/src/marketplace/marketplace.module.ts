/** MarketplaceModule — publish, browse, and import shared decks/collections. */
import { Module } from '@nestjs/common';
import { MarketplaceController, PublicMarketplaceController } from './marketplace.controller';
import { MarketplaceRepository } from './marketplace.repository';
import { MarketplaceRatingsRepository } from './marketplace-ratings.repository';
import { SharesModule } from '../shares/shares.module';
import { NotesFileModule } from '../notes/notes-file.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { FlashcardsModule } from '../flashcards/flashcards.module';
import { QuizModule } from '../quiz/quiz.module';

@Module({
  imports: [SharesModule, NotesFileModule, KnowledgeModule, FlashcardsModule, QuizModule],
  controllers: [MarketplaceController, PublicMarketplaceController],
  providers: [MarketplaceRepository, MarketplaceRatingsRepository],
})
export class MarketplaceModule {}
