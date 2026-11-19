import { Role } from '../common/enums/role.enum';

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}
