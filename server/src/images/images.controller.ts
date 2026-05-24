/**
 * ImagesController — upload and serve note images.
 *
 * Routes:
 *   POST /api/images        — upload an image (multipart/form-data, field: "file")
 *   GET  /api/images/:name  — serve a stored image file
 *
 * POST requires authentication. GET is public (image URLs may be embedded in notes).
 */
import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ImagesService } from './images.service';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { WritableGuard } from '../common/guards/writable.guard';

@Controller('api/images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post()
  @UseGuards(SupabaseAuthGuard, WritableGuard)
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string }) {
    if (!file) throw new BadRequestException('No file uploaded');
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
    }
    return this.imagesService.save(file);
  }

  @Get(':name')
  async serve(@Param('name') name: string, @Res() res: Response) {
    const { path, mimeType } = await this.imagesService.resolve(name);
    if (!path) throw new NotFoundException('Image not found');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(path);
  }
}
