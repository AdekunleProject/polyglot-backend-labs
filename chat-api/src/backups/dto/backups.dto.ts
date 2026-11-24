import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBackupDto {
  // Opens the backup later. It is never stored: lose it and the backup cannot be opened.
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
