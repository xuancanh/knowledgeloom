/**
 * Per-user key-value settings stored as a JSON blob in the user_settings table.
 *
 *   GET   /api/settings   — returns the current user's settings (or {} if none)
 *   PATCH /api/settings   — shallow-merges the body with existing settings
 */
import { Controller, Get, Patch, Body, UseGuards, HttpCode } from '@nestjs/common';
import { UserSettingsRepository } from './user-settings.repository';
import { SupabaseAuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('api/settings')
@UseGuards(SupabaseAuthGuard)
export class SettingsController {
  constructor(private readonly settingsRepo: UserSettingsRepository) {}

  @Get()
  getSettings(@CurrentUser() userId: string) {
    return this.settingsRepo.get(userId);
  }

  @Patch()
  @HttpCode(200)
  patchSettings(@CurrentUser() userId: string, @Body() body: Record<string, unknown>) {
    return this.settingsRepo.patch(userId, body);
  }
}
