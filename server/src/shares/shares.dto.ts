/**
 * Request DTO for creating a share (a single note or a whole category).
 * The controller requires one of the two and validates existence.
 */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateShareDto {
  @IsOptional() @IsString() @MaxLength(200) noteId?: string;
  @IsOptional() @IsString() @MaxLength(200) category?: string;
}
