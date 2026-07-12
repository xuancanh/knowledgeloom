/**
 * Request DTO for creating / renaming a space. The service still enforces the
 * 1–60 char business rule and trimming; this bounds the raw input first.
 */
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SpaceNameDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
}

export class TransferNoteDto {
  @IsString() @MaxLength(200) noteId!: string;
  @IsString() @Matches(/^(default|[a-z0-9][a-z0-9-]{0,39})$/) fromSpaceId!: string;
  @IsString() @Matches(/^(default|[a-z0-9][a-z0-9-]{0,39})$/) toSpaceId!: string;
  @IsIn(['copy', 'move']) mode!: 'copy' | 'move';
}
