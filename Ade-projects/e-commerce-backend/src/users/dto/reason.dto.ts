import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Deactivating or deleting an account needs a written reason, kept in the audit log. */
export class ReasonDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(500)
  readonly reason!: string;
}
