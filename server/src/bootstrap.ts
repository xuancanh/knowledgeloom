/**
 * bootstrap.ts — application factory shared by every deployment.
 *
 * `createApp(options)` builds a fully configured Nest application (CORS,
 * security headers, public rate limiter, validation pipe, exception filter,
 * static SPA serving) without listening; `startApp(options)` listens on the
 * configured port. The OSS entry point (main.ts) calls `startApp({})`;
 * private composing apps import these from @knowledge-loom/server and pass
 * their extension modules / strategy overrides.
 *
 * Note: `reflect-metadata` must be imported before any NestJS decorators are
 * resolved. NestJS imports it internally, but we list it explicitly here as a
 * reminder that emitDecoratorMetadata must be true in tsconfig.json.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, HttpException, HttpStatus, INestApplication } from '@nestjs/common';
import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { AppModule, AppModuleOptions } from './app.module';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as express from 'express';

/** Converts any unhandled exception into the { error: message } JSON shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
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

/** Builds and configures the application without listening. */
export async function createApp(options: AppModuleOptions = {}): Promise<INestApplication> {
  // rawBody exposes the unparsed request body (req.rawBody) for handlers that
  // verify payload signatures — e.g. payment-provider webhooks in extended builds.
  const app = await NestFactory.create(await AppModule.forRoot(options), { logger: ['log', 'warn', 'error'], rawBody: true });

  // Production defaults to same-origin requests. Split frontend/API
  // deployments must opt into their exact browser origin(s).
  const corsOrigin = process.env.CORS_ORIGIN
    || (process.env.NODE_ENV === 'production' ? false : '*');
  app.enableCors({
    origin: corsOrigin,
    methods: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    allowedHeaders: 'content-type,authorization,x-space-id',
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
  const SHARE_UNLOCK_RATE_LIMIT = Number(process.env.SHARE_UNLOCK_RATE_LIMIT || 10);
  const hits = new Map<string, { count: number; windowStart: number }>();
  app.use((req: any, res: any, next: any) => {
    const isShareUnlock = /^\/api\/shares\/[^/]+\/public$/.test(req.path) && req.method === 'POST';
    const isPublic = (isShareUnlock || req.method === 'GET')
      && /^\/api\/(shares\/[^/]+\/public|marketplace(\/|$))/.test(req.path);
    if (!isPublic) return next();
    const now = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = isShareUnlock ? `share-unlock:${req.path}:${ip}` : `public:${ip}`;
    const limit = isShareUnlock ? SHARE_UNLOCK_RATE_LIMIT : RATE_LIMIT;
    const entry = hits.get(key);
    if (!entry || now - entry.windowStart > 60_000) {
      hits.set(key, { count: 1, windowStart: now });
      if (hits.size > 10_000) hits.clear(); // crude memory bound
      return next();
    }
    entry.count += 1;
    if (entry.count > limit) {
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

  return app;
}

/** Builds the application and listens on the configured port. */
export async function startApp(options: AppModuleOptions = {}): Promise<INestApplication> {
  const app = await createApp(options);
  const config = app.get(ConfigService);
  const port = config.get<number>('port');
  const readOnly = config.get<boolean>('readOnly');

  // Local auth without a secret is convenient in development, but a production
  // listener must fail closed unless the operator explicitly accepts that mode.
  if (process.env.NODE_ENV === 'production') {
    const authProvider = config.get<string>('authProvider');
    const authSecret = config.get<string>('authSecret');
    const localMode = !options.authStrategy && (!authProvider || authProvider === 'local');
    if (localMode && !authSecret && process.env.ALLOW_UNAUTHENTICATED_LOCAL !== '1') {
      await app.close();
      throw new Error(
        'Refusing to start production with unauthenticated local auth. ' +
        'Set AUTH_SECRET (or AUTH_PROVIDER), or explicitly set ALLOW_UNAUTHENTICATED_LOCAL=1 ' +
        'when network access is restricted.',
      );
    }
  }

  await app.listen(port);
  console.log(`Knowledge API listening on http://localhost:${port}`);
  if (readOnly) console.log('Knowledge API is running in read-only mode');
  return app;
}
