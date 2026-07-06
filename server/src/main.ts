/**
 * main.ts — NestJS application bootstrap.
 *
 * Startup sequence:
 *  1. Bootstrap NestJS with the Express adapter (compatible with Express 5).
 *  2. Enable permissive CORS for local development and Vite proxy requests.
 *  3. Enable the global validation pipe so DTOs are validated automatically.
 *  4. Mount the global HTTP exception filter that converts NestJS exceptions to
 *     { error: message } JSON responses matching the original Express API shape.
 *  5. Register a 404 wildcard route at app-level (NestJS does not do this by
 *     default — unmatched routes fall through to Express's default handler).
 *  6. Listen on the configured port.
 *
 * Note: `reflect-metadata` must be imported before any NestJS decorators are
 * resolved. NestJS imports it internally, but we list it explicitly here as a
 * reminder that emitDecoratorMetadata must be true in tsconfig.json.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, HttpException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';

/** Converts any unhandled exception into the { error: message } JSON shape. */
@Catch()
class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        message = response;
      } else {
        const r = response as Record<string, unknown>;
        message = (r.message as string) || (r.error as string) || message;
        // Preserve structured payloads (e.g. quota errors carry quota/used/plan).
        extra = r;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      status = (exception as any).status || HttpStatus.INTERNAL_SERVER_ERROR;
    }

    httpAdapter.reply(ctx.getResponse(), { ...extra, error: message }, status);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(await AppModule.forRoot(), { logger: ['log', 'warn', 'error'] });

  app.enableCors({
    origin: '*',
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'content-type,authorization',
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

  // 404 handler for any route not matched by a controller is handled natively by NestJS throwing a NotFoundException,
  // which is then caught and formatted by the AllExceptionsFilter above.

  const config = app.get(ConfigService);
  const port = config.get<number>('port');
  const readOnly = config.get<boolean>('readOnly');

  await app.listen(port);
  console.log(`Knowledge API listening on http://localhost:${port}`);
  if (readOnly) console.log('Knowledge API is running in read-only mode');
}

bootstrap();
