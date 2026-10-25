/**
 * JWT Payload Interface
 *
 * This defines the data stored inside the JWT.
 */

import { Role } from '../enums/role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}
