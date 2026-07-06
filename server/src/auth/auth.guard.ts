/**
 * ApiAuthGuard — authenticates every protected request.
 *
 * The guard itself is provider-agnostic: it delegates to whichever
 * AuthStrategy the AuthModule provided (LocalAuthStrategy in OSS builds,
 * SupabaseAuthStrategy or an SSO strategy in enterprise builds) and attaches
 * the resulting user id to `request.userId`.
 *
 * Apply to a controller or route with `@UseGuards(ApiAuthGuard)`.
 * Controllers that also need write access should stack both guards:
 *   `@UseGuards(ApiAuthGuard, WritableGuard)`
 */
import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_STRATEGY, AuthStrategy } from './auth-strategy.interface';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

@Injectable()
export class ApiAuthGuard implements CanActivate {
  constructor(@Inject(AUTH_STRATEGY) private readonly strategy: AuthStrategy) {}

  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    request.userId = this.strategy.authenticate(request);
    return true;
  }
}
