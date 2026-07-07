/**
 * Request DTOs for reminder create / patch. The service normalizes remindAt,
 * requires a noteId, and trims the message; these bound the raw shape.
 */
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateReminderDto {
  @IsOptional() @IsString() @MaxLength(200) noteId?: string;
  @IsOptional() @IsString() @MaxLength(64) remindAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
}

export class PatchReminderDto {
  @IsOptional() @IsString() @MaxLength(64) remindAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() @IsBoolean() completed?: boolean;
}
