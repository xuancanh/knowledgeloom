/**
 * ApiAuthGuard — authenticates every protected request and resolves the
 * active space.
 *
 * The guard itself is provider-agnostic: it delegates to whichever
 * AuthStrategy the AuthModule provided and attaches the resulting user id to
 * `request.userId`.
 *
 * It then reads the optional `x-space-id` header and attaches the data-scope
 * key to `request.scopeId` (see spaces/scope.util.ts): the bare user id for
 * the default space, `userId~spaceId` for a user-created space. A space id
 * that doesn't exist or belongs to another user is rejected, so no request
 * can ever reach another user's — or even another space's — data by forging
 * the header.
 *
 * Apply to a controller or route with `@UseGuards(ApiAuthGuard)`.
 * Controllers that also need write access should stack both guards:
 *   `@UseGuards(ApiAuthGuard, WritableGuard)`
 */
import { BadRequestException, CanActivate, ExecutionContext, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_STRATEGY, AuthStrategy } from './auth-strategy.interface';
import { SpacesRepository } from '../spaces/spaces.repository';
import { DEFAULT_SPACE_ID, SCOPE_SEPARATOR, SPACE_ID_PATTERN, scopeFor } from '../spaces/scope.util';

export interface AuthenticatedRequest extends Request {
  userId: string;
  /** Data-scope key for the active space (defaults to userId). */
  scopeId: string;
}

@Injectable()
export class ApiAuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_STRATEGY) private readonly strategy: AuthStrategy,
    private readonly spacesRepo: SpacesRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    request.userId = this.strategy.authenticate(request);
    if (request.userId.includes(SCOPE_SEPARATOR)) {
      // '~' is reserved as the scope separator; no real auth provider emits it.
      throw new BadRequestException('invalid user id');
    }
    request.scopeId = await this.resolveScope(request.userId, request.headers['x-space-id']);
    return true;
  }

  private async resolveScope(userId: string, header: unknown): Promise<string> {
    const spaceId = String(header ?? '').trim();
    if (!spaceId || spaceId === DEFAULT_SPACE_ID) return userId;
    if (!SPACE_ID_PATTERN.test(spaceId)) {
      throw new BadRequestException('invalid x-space-id header');
    }
    const space = await this.spacesRepo.findForUser(userId, spaceId);
    if (!space) throw new NotFoundException('space not found');
    return scopeFor(userId, spaceId);
  }
}
