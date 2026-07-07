/**
 * Request DTO for the quiz review endpoint. See flashcards.dto.ts for the
 * optional-but-typed rationale.
 */
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ReviewQuizDto {
  @IsOptional() @IsIn(['correct', 'wrong']) rating?: 'correct' | 'wrong';
  @IsOptional() @IsString() @MaxLength(200) noteId?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100000) currentStreak?: number;
}
