import {
  IsDateString,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { StrongPassword } from '../strong-password.decorator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z]+$/, { message: 'firstname must contain letters only' })
  firstname: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Za-z]+$/, { message: 'middlename must contain letters only' })
  middlename?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z]+$/, { message: 'lastname must contain letters only' })
  lastname: string;

  @IsEmail()
  @MaxLength(150)
  email: string;

  @StrongPassword()
  password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  phoneNumber: string;

  @IsDateString()
  dateOfBirth: string;

  @IsIn(['male', 'female', 'other'])
  gender: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[A-Za-z0-9\s,./-]+$/, {
    message: 'Address can contain letters, numbers, spaces, and , . / - characters',
  })
  address: string;
}
