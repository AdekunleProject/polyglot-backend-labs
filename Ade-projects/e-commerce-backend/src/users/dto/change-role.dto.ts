import { IsEnum } from 'class-validator';
import { Role } from 'src/common/enums/role.enum';

export class ChangeRoleDto {
  @IsEnum(Role)
  readonly role!: Role;
}
