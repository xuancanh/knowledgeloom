/** TtsModule — podcast text-to-speech (GET /api/tts/config, POST /api/tts/podcast). */
import { Module } from '@nestjs/common';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';

@Module({
  controllers: [TtsController],
  providers: [TtsService],
})
export class TtsModule {}
