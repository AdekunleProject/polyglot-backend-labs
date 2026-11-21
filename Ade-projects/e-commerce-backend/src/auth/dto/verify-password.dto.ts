import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class VerifyPasswordDto {
  @IsEmail()
  readonly email!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  readonly code!: string;
}
