/**
 * Per-user key-value settings stored as a JSON blob in the user_settings table.
 *
 *   GET   /api/settings   — returns the current user's settings (or {} if none)
 *   PATCH /api/settings   — shallow-merges the body with existing settings
 */
import { Controller, Get, Patch, Body, UseGuards, HttpCode } from '@nestjs/common';
import { UserSettingsRepository } from './user-settings.repository';
import { ApiAuthGuard } from '../auth/auth.guard';
import { WritableGuard } from '../common/guards/writable.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('api/settings')
@UseGuards(ApiAuthGuard)
export class SettingsController {
  constructor(private readonly settingsRepo: UserSettingsRepository) {}

  @Get()
  getSettings(@CurrentUser() userId: string) {
    return this.settingsRepo.get(userId);
  }

  @Patch()
  @UseGuards(WritableGuard)
  @HttpCode(200)
  patchSettings(@CurrentUser() userId: string, @Body() body: Record<string, unknown>) {
    return this.settingsRepo.patch(userId, body);
  }
}
