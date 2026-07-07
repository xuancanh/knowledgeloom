/**
 * Request DTOs for learn-progress mutations. The controller clamps xp and reads
 * named note fields; these bound the raw shape and strip unknown properties.
 */
import { IsArray, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export class AwardXpDto {
  @IsOptional() @IsNumber() xp?: number;
}

export class GenerateDeckDto {
  @IsOptional() @IsString() @MaxLength(200) noteId?: string;
  @IsOptional() @IsString() @MaxLength(400) title?: string;
  @IsOptional() @IsString() @MaxLength(200) category?: string;
  @IsOptional() @IsString() @MaxLength(4000) summary?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}
