/**
 * @CurrentScope() — extracts the active data-scope key from the request, as
 * set by ApiAuthGuard from the authenticated user + `x-space-id` header.
 *
 * Use this instead of @CurrentUser() in any controller that reads or writes
 * space-scoped data (notes, flashcards, quiz, reminders, jobs, shares…).
 * Keep @CurrentUser() for user-level concerns: settings, space management,
 * plan quotas, and marketplace rating identity.
 *
 * @example
 *   @Get(':id')
 *   @UseGuards(ApiAuthGuard)
 *   async getNote(@Param('id') id: string, @CurrentScope() scope: string) {
 *     return this.notesService.getMarkdown(scope, id);
 *   }
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard';

export const CurrentScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.scopeId ?? request.userId;
  },
);
