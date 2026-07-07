/**
 * Request DTO for POST /api/study/exam-plan. The controller enforces the
 * YYYY-MM-DD format and future-date rule; this bounds the raw shape and the
 * optional scope filter.
 */
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ExamScopeDto {
  @IsOptional() @IsString() @MaxLength(200) category?: string;
  @IsOptional() @IsString() @MaxLength(200) tag?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) noteIds?: string[];
}

export class ExamPlanDto {
  @IsOptional() @IsString() @MaxLength(20) examDate?: string;
  @IsOptional() @ValidateNested() @Type(() => ExamScopeDto) scope?: ExamScopeDto;
}
