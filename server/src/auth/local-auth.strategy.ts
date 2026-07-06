/**
 * LocalAuthStrategy — OSS default authentication.
 *
 * Two modes, selected by whether AUTH_SECRET is configured:
 *
 *  - No AUTH_SECRET (default): single-user local mode. Every request is
 *    accepted as userId='local'. Correct for a personal instance on a
 *    trusted machine or network.
 *
 *  - AUTH_SECRET set: requests must carry `Authorization: Bearer <secret>`.
 *    For self-hosters who expose the instance to the internet. The comparison
 *    is constant-time to prevent timing attacks. Still single-user ('local');
 *    multi-user identity is an enterprise concern.
 */
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import type { AuthStrategy } from './auth-strategy.interface';

@Injectable()
export class LocalAuthStrategy implements AuthStrategy {
  private readonly logger = new Logger(LocalAuthStrategy.name);
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.get<string>('authSecret') ?? '';
    if (!this.secret) {
      this.logger.log('Local mode — all requests use userId="local" (set AUTH_SECRET to require a bearer token).');
    }
  }

  authenticate(request: Request): string {
    if (!this.secret) return 'local';

    const auth = request.headers['authorization'];
    const [scheme, token] = (auth ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const expected = Buffer.from(this.secret);
    const provided = Buffer.from(token);
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      throw new UnauthorizedException('Invalid token');
    }
    return 'local';
  }
}
