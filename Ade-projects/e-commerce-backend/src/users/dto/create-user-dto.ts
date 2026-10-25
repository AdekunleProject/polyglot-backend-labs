import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from 'src/common/enums/role.enum';

class EmergencyContactDto {
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsString() phonenumber!: string;
  @IsOptional() @IsEmail() email?: string;
}

class NotificationsDto {
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() inApp?: boolean;
  @IsOptional() @IsBoolean() sms?: boolean;
}

export class CreateUserDto {
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsOptional() @IsString() address?: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() phoneNumber?: string;
  @IsString() password!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergencyContact?: EmergencyContactDto;

  @IsOptional() @IsBoolean() isVerified?: boolean;
  @IsOptional() @IsString() dateOfEmployment?: string;
  @IsOptional() @IsString() resetToken?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() gender?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationsDto)
  notifications?: NotificationsDto;
}
