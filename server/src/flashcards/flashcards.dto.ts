/**
 * Request DTOs for the flashcard mutation endpoints.
 *
 * Fields are optional + typed rather than required: the global ValidationPipe
 * (whitelist + transform) strips unknown properties and enforces type / length /
 * enum shape, while the service keeps ownership and business rules. Making them
 * optional preserves the pre-DTO contract (the handlers already tolerate missing
 * values) — the win here is mass-assignment stripping and type/length guards.
 */
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFlashcardDto {
  @IsOptional() @IsString() @MaxLength(200) noteId?: string;
  @IsOptional() @IsString() @MaxLength(4000) prompt?: string;
  @IsOptional() @IsString() @MaxLength(20000) lesson?: string;
  @IsOptional() @IsString() @MaxLength(40) kind?: string;
}

export class UpdateFlashcardDto {
  @IsOptional() @IsString() @MaxLength(4000) prompt?: string;
  @IsOptional() @IsString() @MaxLength(20000) lesson?: string;
  @IsOptional() @IsString() @MaxLength(40) kind?: string;
}

export class ReviewFlashcardDto {
  @IsOptional() @IsIn(['again', 'hard', 'good']) rating?: 'again' | 'hard' | 'good';
  @IsOptional() @IsString() @MaxLength(200) noteId?: string;
  @IsOptional() @IsBoolean() isUserCard?: boolean;
}
