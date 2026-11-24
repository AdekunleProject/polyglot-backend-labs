import { Role } from './enums/role.enum';

/** Higher means more powerful. */
const RANK: Record<Role, number> = {
  [Role.USER]: 1,
  [Role.MANAGER]: 2,
  [Role.ADMIN]: 3,
  [Role.SUPERADMIN]: 4,
};

export const rankOf = (role: Role): number => RANK[role] ?? 0;

/** True when `role` is `min` or above, e.g. isAtLeast(role, Role.ADMIN). */
export const isAtLeast = (role: Role, min: Role): boolean =>
  rankOf(role) >= rankOf(min);

/**
 * The roles each role may give to someone else (when creating an account or
 * changing a role). Nobody can hand out superadmin: that account exists only
 * through the SUPERADMIN_EMAIL setting. A manager can only turn a plain user
 * into a manager.
 */
export const ASSIGNABLE: Record<Role, Role[]> = {
  [Role.SUPERADMIN]: [Role.ADMIN, Role.MANAGER, Role.USER],
  [Role.ADMIN]: [Role.MANAGER, Role.USER],
  [Role.MANAGER]: [Role.MANAGER],
  [Role.USER]: [],
};

/**
 * Whether `actor` may act on an account that has the role `target`: only on
 * accounts strictly below their own rank. That also means nobody can act on
 * themselves or on an equal.
 */
export const canManage = (actor: Role, target: Role): boolean =>
  rankOf(actor) > rankOf(target);

/** The roles below `role`, for filtering the user list. */
export const rolesBelow = (role: Role): Role[] =>
  Object.values(Role).filter((candidate) => rankOf(candidate) < rankOf(role));

/** Whether `actor` may change an account with role `target` to `next`. */
export const canAssign = (actor: Role, target: Role, next: Role): boolean =>
  canManage(actor, target) && ASSIGNABLE[actor].includes(next);
