import { IsEmail, IsEnum, IsString } from 'class-validator';
import { Role } from 'src/common/enums/role.enum';

export class CreateAdminProfileDto {
  @IsString()
  firstname!: string;

  @IsString()
  lastname!: string;

  @IsEmail()
  email!: string;

  @IsEnum(Role)
  role!: Role;
}
