import { Role } from '../common/enums/role.enum';
import { rankOf } from '../common/role-policy';

/**
 * Why a signed-in person can only use a few routes:
 * - 'change-password': an admin created the account, so the emailed password
 *   must be replaced before anything else.
 * - 'two-factor': admins and the superadmin must turn on 2FA first
 *   (production).
 */
export type Restriction = 'change-password' | 'two-factor';

type Route = [method: string, path: string];

const ALWAYS: Route[] = [
  ['GET', '/users/me'],
  ['GET', '/auth/me'],
  ['POST', '/auth/logout'],
];

const ALLOWED: Record<Restriction, Route[]> = {
  'change-password': [...ALWAYS, ['POST', '/users/me/change-password']],
  'two-factor': [
    ...ALWAYS,
    ['POST', '/auth/2fa/setup'],
    ['POST', '/auth/2fa/enable'],
  ],
};

export function isAllowedWhileRestricted(
  restriction: Restriction,
  method: string,
  path: string,
): boolean {
  return ALLOWED[restriction].some(
    ([m, p]) => m === method.toUpperCase() && p === path.replace(/\/+$/, ''),
  );
}

export function restrictionFor(
  user: { role: Role; mustChangePassword?: boolean; twoFactorEnabled?: boolean },
  requireAdminTwoFactor: boolean,
): Restriction | undefined {
  if (user.mustChangePassword) return 'change-password';
  if (
    requireAdminTwoFactor &&
    rankOf(user.role) >= rankOf(Role.ADMIN) &&
    !user.twoFactorEnabled
  ) {
    return 'two-factor';
  }
  return undefined;
}
