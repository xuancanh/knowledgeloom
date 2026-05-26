import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { UserSettingsRepository } from './user-settings.repository';

@Module({
  controllers: [SettingsController],
  providers: [UserSettingsRepository],
  exports: [UserSettingsRepository],
})
export class SettingsModule {}
