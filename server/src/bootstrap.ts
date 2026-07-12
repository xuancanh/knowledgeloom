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
import Redis from 'ioredis';
import {
  createPublicRateLimitMiddleware,
  MemoryRateLimitStore,
  RedisRateLimitStore,
  type RateLimitStore,
} from './common/public-rate-limiter';

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
    allowedHeaders: 'content-type,authorization,x-space-id,if-match',
  });

  // Baseline security headers (no framework dependency needed for these).
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const config = app.get(ConfigService);
  // Local auth without a secret is convenient in development, but every way
  // of constructing a production app must fail closed unless explicitly opted in.
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

  // Public endpoints (share links, marketplace browsing) are unauthenticated
  // by design; a per-IP fixed-window limiter keeps them from becoming a free
  // file-read amplifier. Authenticated routes are not limited here.
  const rateLimitStoreName = config.get<string>('publicRateLimitStore');
  const publicLimit = config.get<number>('publicRateLimit');
  const shareUnlockLimit = config.get<number>('shareUnlockRateLimit');
  if (!Number.isInteger(publicLimit) || publicLimit < 1 || !Number.isInteger(shareUnlockLimit) || shareUnlockLimit < 1) {
    await app.close();
    throw new Error('PUBLIC_RATE_LIMIT and SHARE_UNLOCK_RATE_LIMIT must be positive integers');
  }
  let rateLimitStore: RateLimitStore;
  if (rateLimitStoreName === 'redis') {
    const redis = new Redis({
      host: config.get<string>('redisHost'),
      port: config.get<number>('redisPort'),
      password: config.get<string>('redisPassword') || undefined,
      db: config.get<number>('redisDb') || 0,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });
    redis.on('error', () => { /* request middleware returns a controlled 503 */ });
    try {
      await redis.connect();
    } catch (error) {
      redis.disconnect();
      await app.close();
      const ErrorWithCause = Error as unknown as new (
        message: string,
        options: { cause: unknown },
      ) => Error;
      throw new ErrorWithCause(
        `PUBLIC_RATE_LIMIT_STORE=redis requires a reachable Redis server: ${(error as Error).message}`,
        { cause: error },
      );
    }
    rateLimitStore = new RedisRateLimitStore(redis, config.get<string>('publicRateLimitPrefix'));
  } else if (rateLimitStoreName === 'memory') {
    rateLimitStore = new MemoryRateLimitStore();
  } else {
    await app.close();
    throw new Error(`Unsupported PUBLIC_RATE_LIMIT_STORE: ${rateLimitStoreName}`);
  }
  app.getHttpServer().once('close', () => rateLimitStore.close());
  app.use(createPublicRateLimitMiddleware(rateLimitStore, {
    publicLimit,
    shareUnlockLimit,
  }));

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

  await app.listen(port);
  console.log(`Knowledge API listening on http://localhost:${port}`);
  if (readOnly) console.log('Knowledge API is running in read-only mode');
  return app;
}
