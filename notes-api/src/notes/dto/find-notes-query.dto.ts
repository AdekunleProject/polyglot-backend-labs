// Next: pagination
// Right now GET /notes returns every note. With 10 notes that’s fine. With 100,000 it would be slow,
// use lots of memory, and send a huge response. Pagination fixes this by returning a small page at a time:

import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

// @Type(() => Number) turns the text from the URL into a number.
// @Max(50) stops someone requesting limit=1000000, which would defeat the point of pagination.
// The = 1 and = 10 are defaults when the caller sends nothing.
export class FindNotesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;

  @IsOptional()
  @IsString()
  search: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  userId: number;
}
