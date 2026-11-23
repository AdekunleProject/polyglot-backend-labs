import { IsBoolean, IsString, MaxLength, MinLength } from 'class-validator';

/** The manager's check of the evidence, or the admin's decision. A note is always required. */
export class ReviewDto {
  @IsBoolean()
  readonly approve!: boolean;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  readonly note!: string;
}
