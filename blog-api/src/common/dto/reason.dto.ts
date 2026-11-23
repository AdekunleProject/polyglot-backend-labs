import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** A written reason, kept in the audit log. Required for actions that affect other people. */
export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(500)
  readonly reason!: string;
}

/** For actions where the owner needs no reason but staff acting on someone else's work do. */
export class OptionalReasonDto {
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  readonly reason?: string;
}
