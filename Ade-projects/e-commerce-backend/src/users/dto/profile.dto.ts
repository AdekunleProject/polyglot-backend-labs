import {
  IsOptional,
  IsString,
  IsEmail,
  IsPhoneNumber,
  IsDateString,
  IsEnum,
} from 'class-validator';

export class UserProfileDto {
  @IsString()
  firstname?: string;

  @IsString()
  lastname?: string;

  @IsEmail()
  email?: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsOptional()
  gender?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsOptional()
  emergencyContact?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsPhoneNumber()
  @IsOptional()
  phoneNumber?: string;
}
