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
  @Matches(/(?=.*[A-Z])(?=.*[a-z])/, {
    message: 'firstname should only be alphabetical characters',
  })
  firstname!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/(?=.*[A-Z])(?=.*[a-z])/, {
    message: 'last name should only be alphabetical characters',
  })
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
