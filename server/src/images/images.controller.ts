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
import { ApiAuthGuard } from '../auth/auth.guard';
import { WritableGuard } from '../common/guards/writable.guard';

/** Hard cap on uploaded image size — rejects oversized/decompression payloads
 *  at the multipart layer before the buffer is ever held in memory. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Sniff the real image type from the file's leading bytes so a spoofed
 * Content-Type can't smuggle a non-image (e.g. an HTML/script payload) past the
 * mime allowlist. Returns the detected kind, or null if the bytes match no
 * supported image format.
 */
function detectImageKind(buf: Buffer): 'jpeg' | 'png' | 'gif' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.length >= 4 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

@Controller('api/images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post()
  @UseGuards(ApiAuthGuard, WritableGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  async upload(@UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string }) {
    if (!file) throw new BadRequestException('No file uploaded');
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      throw new BadRequestException(`File type not allowed: ${file.mimetype}`);
    }
    // Content-based check: the bytes must actually be a supported image, not
    // just claim to be one via the (client-controlled) Content-Type header.
    if (!detectImageKind(file.buffer)) {
      throw new BadRequestException('file content is not a recognized image');
    }
    return this.imagesService.save(file);
  }

  @Get(':name')
  async serve(@Param('name') name: string, @Res() res: Response) {
    const { path, mimeType } = await this.imagesService.resolve(name);
    if (!path) throw new NotFoundException('Image not found');
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // User-uploaded SVG can embed scripts; a no-script CSP neutralizes it
    // when the file is opened directly (same-origin XSS vector otherwise).
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.sendFile(path);
  }
}
