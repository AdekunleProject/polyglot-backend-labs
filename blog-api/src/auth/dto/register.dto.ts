import { IsDateString, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, Matches, isNotEmpty, MinLength 
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z]+$/, {
    message: 'Firstname must contain letters only',
  })
  firstname: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z]+$/, {
    message: 'lastname must contain letters only',
  })
  lastname: string;

  @IsOptional()
  @MaxLength(100)
  @Matches(/^[A-Za-z]+$/, {
    message: 'middlename must contain letters only',
  })
  middlename: string;

  @IsEmail()
  @MaxLength(150)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(20)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).+$/, {
    message:
      'Password must contain upper & lower case letters, a number and a special character',
  })
  password: string;

  @IsNotEmpty()
  @MaxLength(30)
  phoneNumber?: string;

  @IsNotEmpty()
  @IsDateString()
  dateOfBirth?: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['male', 'female', 'other'])
  gender?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[A-Za-z0-9\s,./-]+$/, {
    message: 'Address can contain letters, numbers, spaces, and , . / - characters',
  })
  address?: string;
}
