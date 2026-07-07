/**
 * Request DTO for POST /api/notes/:id/regenerate. The controller normalizes
 * target/size to a safe enum set; this bounds the raw shape.
 *
 * The note update/patch and assist endpoints intentionally keep freeform bodies:
 * update() merges arbitrary note fields and the assist endpoints forward a
 * freeform editor `draft`, so a whitelisting DTO would drop legitimate fields.
 */
import { IsIn, IsOptional } from 'class-validator';

export class RegenerateDto {
  @IsOptional() @IsIn(['all', 'quiz', 'flashcards']) target?: string;
  @IsOptional() @IsIn(['small', 'medium', 'large']) size?: string;
}
