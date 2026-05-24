import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';

@Module({
  imports: [MulterModule.register({ storage: memoryStorage() })],
  controllers: [ImagesController],
  providers: [ImagesService],
})
export class ImagesModule {}
