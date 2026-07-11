/**
 * Request DTO for creating a share (a single note or a whole category).
 * The controller requires one of the two and validates existence.
 */
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateShareDto {
  @IsOptional() @IsString() @MaxLength(200) noteId?: string;
  @IsOptional() @IsString() @MaxLength(200) category?: string;
  /** Optional link lifetime in days (1–365); omitted = never expires. */
  @IsOptional() @IsInt() @Min(1) @Max(365) expiresInDays?: number;
  /** Optional password; only its salted scrypt derivation is persisted. */
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) password?: string;
}

export class UnlockShareDto {
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
