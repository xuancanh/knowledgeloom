/**
 * Request DTO for creating / renaming a space. The service still enforces the
 * 1–60 char business rule and trimming; this bounds the raw input first.
 */
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SpaceNameDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
}
