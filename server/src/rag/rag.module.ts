import { Module } from '@nestjs/common';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { SearchModule } from '../search/search.module';
import { NotesFileModule } from '../notes/notes-file.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule, SearchModule, NotesFileModule],
  controllers: [RagController],
  providers: [RagService],
})
export class RagModule {}
