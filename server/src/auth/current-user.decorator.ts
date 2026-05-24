/**
 * @CurrentUser() — extracts the authenticated user's Supabase ID from the
 * request, as set by SupabaseAuthGuard.
 *
 * @example
 *   @Get(':id')
 *   @UseGuards(SupabaseAuthGuard)
 *   async getNote(@Param('id') id: string, @CurrentUser() userId: string) {
 *     return this.notesService.getMarkdown(userId, id);
 *   }
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from './auth.guard';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.userId;
  },
);
