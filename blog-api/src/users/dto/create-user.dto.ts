import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z]+$/, { message: 'firstname must contain letters only' })
  firstname: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z]+$/, { message: 'lastname must contain letters only' })
  lastname: string;

  @IsEmail()
  @MaxLength(150)
  email: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
