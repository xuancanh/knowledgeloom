/**
 * Spaces API — manage the user's isolated sub-workspaces.
 *
 *   GET    /api/spaces      — list spaces (default first) + plan limit
 *   POST   /api/spaces      — create a space ({ name })
 *   PATCH  /api/spaces/:id  — rename a space ({ name })
 *   DELETE /api/spaces/:id  — delete a space and all its data
 *
 * Every other endpoint selects the active space via the `x-space-id` request
 * header (resolved by ApiAuthGuard); these endpoints always operate on the
 * authenticated user, never on a scope.
 */
import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, HttpCode } from '@nestjs/common';
import { SpacesService } from './spaces.service';
import { ApiAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SpaceNameDto } from './spaces.dto';

@Controller('api/spaces')
@UseGuards(ApiAuthGuard)
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.spaces.list(userId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body() body: SpaceNameDto) {
    return this.spaces.create(userId, body?.name);
  }

  @Patch(':id')
  @HttpCode(200)
  rename(@CurrentUser() userId: string, @Param('id') id: string, @Body() body: SpaceNameDto) {
    return this.spaces.rename(userId, id, body?.name);
  }

  @Delete(':id')
  @HttpCode(200)
  delete(@CurrentUser() userId: string, @Param('id') id: string) {
    return this.spaces.delete(userId, id);
  }
}
