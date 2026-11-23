import type { Restriction } from '../../auth/access-restriction';
import { Role } from '../enums/role.enum';

export interface CurrentUserInterface {
  id: string;
  email: string;
  role: Role;
  /** Set when the person must do something before using the API. */
  restriction?: Restriction;
}
