/**
 * Request DTO for the podcast TTS endpoint. The controller already caps line
 * length and count and normalizes the speaker; this validates the raw shape and
 * strips unknown per-line properties.
 */
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PodcastLineDto {
  @IsOptional() @IsString() @MaxLength(40) who?: string;
  @IsOptional() @IsString() @MaxLength(4000) text?: string;
}

export class PodcastDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PodcastLineDto)
  lines?: PodcastLineDto[];
}
