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
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as express from 'express';

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
  // rawBody exposes the unparsed request body (req.rawBody) for handlers that
  // verify payload signatures — e.g. payment-provider webhooks in extended builds.
  const app = await NestFactory.create(await AppModule.forRoot(), { logger: ['log', 'warn', 'error'], rawBody: true });

  // CORS_ORIGIN restricts browser callers in production (default * preserves
  // local-dev behaviour where Vite proxies /api anyway).
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'content-type,authorization',
  });

  // Baseline security headers (no framework dependency needed for these).
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Public endpoints (share links, marketplace browsing) are unauthenticated
  // by design; a per-IP fixed-window limiter keeps them from becoming a free
  // file-read amplifier. Authenticated routes are not limited here.
  const RATE_LIMIT = Number(process.env.PUBLIC_RATE_LIMIT || 120); // req/min/ip
  const hits = new Map<string, { count: number; windowStart: number }>();
  app.use((req: any, res: any, next: any) => {
    const isPublic = /^\/api\/(shares\/[^/]+\/public|marketplace(\/|$))/.test(req.path)
      && req.method === 'GET';
    if (!isPublic) return next();
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const entry = hits.get(key);
    if (!entry || now - entry.windowStart > 60_000) {
      hits.set(key, { count: 1, windowStart: now });
      if (hits.size > 10_000) hits.clear(); // crude memory bound
      return next();
    }
    entry.count += 1;
    if (entry.count > RATE_LIMIT) {
      res.status(429).json({ error: 'rate limit exceeded — try again shortly' });
      return;
    }
    next();
  });

  // whitelist strips properties not declared on a validated DTO, so any future
  // class-validated body is protected from mass-assignment by default. (Current
  // controllers read `any` bodies and validate by hand; this is a safe default
  // for both.)
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const httpAdapterHost = app.get(HttpAdapterHost);
  app.useGlobalFilters(new AllExceptionsFilter(httpAdapterHost));

  // Single-container mode: when a frontend build is present (Docker image,
  // self-host), serve it and SPA-fallback every non-API GET to index.html.
  // In split deployments (Vite dev, Cloudflare Pages) the folder is absent
  // and this is a no-op.
  const webDist = process.env.WEB_DIST || resolve(__dirname, '../../dist');
  if (existsSync(join(webDist, 'index.html'))) {
    app.use(express.static(webDist));
    app.use((req: any, res: any, next: any) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/') && req.accepts('html')) {
        res.sendFile(join(webDist, 'index.html'));
      } else {
        next();
      }
    });
    console.log(`Serving web app from ${webDist}`);
  }

  // 404 handler for any route not matched by a controller is handled natively by NestJS throwing a NotFoundException,
  // which is then caught and formatted by the AllExceptionsFilter above.

  const config = app.get(ConfigService);
  const port = config.get<number>('port');
  const readOnly = config.get<boolean>('readOnly');

  // Production-readiness warnings: surface footguns that are fine locally but
  // dangerous on an exposed host. Non-fatal by design (self-hosters run all
  // kinds of setups); set the opt-out envs to silence a deliberate choice.
  if (process.env.NODE_ENV === 'production') {
    const authProvider = config.get<string>('authProvider');
    const authSecret = config.get<string>('authSecret');
    const localMode = !authProvider || authProvider === 'local';
    if (localMode && !authSecret && process.env.ALLOW_UNAUTHENTICATED_LOCAL !== '1') {
      console.warn(
        '⚠️  SECURITY: running in production with local auth and no AUTH_SECRET — ' +
        'every request is treated as the owner and writes are unauthenticated. ' +
        'Set AUTH_SECRET (or AUTH_PROVIDER), or ALLOW_UNAUTHENTICATED_LOCAL=1 to silence.',
      );
    }
    if (!process.env.CORS_ORIGIN) {
      console.warn(
        '⚠️  SECURITY: CORS_ORIGIN is unset in production (defaults to "*") — ' +
        'any origin can call the API. Set CORS_ORIGIN to your web origin(s).',
      );
    }
  }

  await app.listen(port);
  console.log(`Knowledge API listening on http://localhost:${port}`);
  if (readOnly) console.log('Knowledge API is running in read-only mode');
}

bootstrap();
