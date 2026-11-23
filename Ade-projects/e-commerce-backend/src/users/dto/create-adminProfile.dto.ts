import { IsEmail, IsEnum, IsString } from 'class-validator';
import { Role } from 'src/common/enums/role.enum';

export class CreateAdminProfileDto {
  @IsString()
  firstname!: string;

  @IsString()
  lastname!: string;

  @IsEmail()
  email!: string;

  // What the creator may hand out depends on their own role (see role-policy).
  @IsEnum(Role)
  role!: Role;
}
