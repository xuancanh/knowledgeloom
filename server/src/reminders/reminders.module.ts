/**
 * RemindersModule — note reminder scheduling.
 *
 * ReminderRepository uses the DRIZZLE_DB provider from the global
 * DatabaseModule — no need to import DatabaseModule here explicitly.
 * RemindersService is exported so NotesService can remove reminders when a
 * note is deleted.
 */
import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { ReminderRepository } from './reminder.repository';

@Module({
  controllers: [RemindersController],
  providers: [RemindersService, ReminderRepository],
  exports: [RemindersService],
})
export class RemindersModule {}
