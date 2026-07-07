/**
 * Request DTO for creating a share (a single note or a whole category).
 * The controller requires one of the two and validates existence.
 */
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateShareDto {
  @IsOptional() @IsString() @MaxLength(200) noteId?: string;
  @IsOptional() @IsString() @MaxLength(200) category?: string;
  /** Optional link lifetime in days (1–365); omitted = never expires. */
  @IsOptional() @IsInt() @Min(1) @Max(365) expiresInDays?: number;
}
