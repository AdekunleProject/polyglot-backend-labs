import { Role } from '../enums/role.enum';

export interface CurrentUserInterface {
  id: string;
  email: string;
  role: Role;
}
