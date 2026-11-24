import { Role } from '../common/enums/role.enum';
import type { Restriction } from './access-restriction';

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
  /** The signed-in device (session) this request comes from. */
  sid?: string;
  /** Set when the person must do something before using the API. */
  restriction?: Restriction;
}
