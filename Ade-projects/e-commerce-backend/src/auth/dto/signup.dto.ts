import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
  MaxLength,
  IsOptional,
} from 'class-validator';

// import { Role } from 'src/common/enums/role.enum';
// import {UserRole} from '../../users/schemas/user.schema'

export class SignupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z]+$/, { message: 'firstname must contain letters only' })
  firstname!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Za-z]+$/, { message: 'middlename must contain letters only' })
  middlename?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z]+$/, { message: 'lastname must contain letters only' })
  lastname!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(20)
  @Matches(/(?=.*[!@#$%^&*])(?=.*[0-9])(?=.*[A-Z])(?=.*[a-z])/, {
    message:
      'Password must be alpha-numeric, must have upper and lower case and at least one special character.',
  })
  readonly password!: string;

  @IsString()
  readonly address!: string;

  @IsString()
  readonly phoneNumber!: string;

  @IsString()
  readonly dateOfBirth!: string;

  @IsString()
  readonly gender!: string;

  // @IsOptional()
  // @IsString()
  // readonly role!: Role;
}
