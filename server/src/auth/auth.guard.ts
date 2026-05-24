/**
 * SupabaseAuthGuard — validates the Supabase JWT on every protected request.
 *
 * Reads the Bearer token from the Authorization header, verifies the JWT
 * signature locally using SUPABASE_JWT_SECRET (HS256), and attaches the
 * Supabase user ID (JWT `sub` claim) to `request.userId`.
 *
 * Security properties:
 * - Signature verified locally — no round-trip to Supabase on every request.
 * - JWT expiry (`exp`) is enforced by jsonwebtoken's `verify` call.
 * - Returns 401 for missing, malformed, or expired tokens.
 *
 * Apply to a controller or route with `@UseGuards(SupabaseAuthGuard)`.
 * Controllers that also need write access should stack both guards:
 *   `@UseGuards(SupabaseAuthGuard, WritableGuard)`
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private readonly jwtSecret: string;

  constructor(private readonly config: ConfigService) {
    this.jwtSecret = config.get<string>('supabaseJwtSecret') ?? '';
    if (!this.jwtSecret) {
      this.logger.warn(
        'SUPABASE_JWT_SECRET is not set — all authenticated requests will be rejected.',
      );
    }
  }

  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing authorization token');

    if (!this.jwtSecret) throw new UnauthorizedException('Auth not configured');

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, this.jwtSecret) as jwt.JwtPayload;
    } catch (err: any) {
      throw new UnauthorizedException(`Invalid token: ${err?.message}`);
    }

    const userId = payload.sub;
    if (!userId || typeof userId !== 'string') {
      throw new UnauthorizedException('Token missing user identity');
    }

    request.userId = userId;
    return true;
  }

  private extractToken(request: Request): string | null {
    const auth = request.headers['authorization'];
    if (!auth) return null;
    const [scheme, token] = auth.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    return token;
  }
}
