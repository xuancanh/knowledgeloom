/**
 * Request DTOs for the marketplace mutation endpoints. The controller still
 * slices titles/descriptions/tags to their storage limits; these bound the raw
 * input and strip unknown properties first.
 */
import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PublishListingDto {
  @IsOptional() @IsString() @MaxLength(200) shareId?: string;
  @IsOptional() @IsString() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(120) author?: string;
}

export class RateListingDto {
  @IsOptional() @IsInt() @Min(1) @Max(5) stars?: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class ReportListingDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
