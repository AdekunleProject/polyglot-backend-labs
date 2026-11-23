import { Role } from './enums/role.enum';

/** Higher means more powerful. */
const RANK: Record<Role, number> = {
  [Role.CUSTOMER]: 1,
  [Role.MANAGER]: 2,
  [Role.ADMIN]: 3,
  [Role.SUPERADMIN]: 4,
};

export const rankOf = (role: Role): number => RANK[role] ?? 0;

export const isStaff = (role: Role): boolean => role !== Role.CUSTOMER;

/** The roles below `role`, used to filter the user list. */
export const rolesBelow = (role: Role): Role[] =>
  Object.values(Role).filter((candidate) => rankOf(candidate) < rankOf(role));

/**
 * The roles each role may give to someone else (creating an account or
 * changing a role). Nobody can hand out superadmin: that account exists only
 * through the SUPERADMIN_EMAIL setting. Managers cannot change roles.
 */
export const ASSIGNABLE: Record<Role, Role[]> = {
  [Role.SUPERADMIN]: [Role.ADMIN, Role.MANAGER, Role.CUSTOMER],
  [Role.ADMIN]: [Role.MANAGER, Role.CUSTOMER],
  [Role.MANAGER]: [],
  [Role.CUSTOMER]: [],
};

/**
 * Who can do what to ANOTHER account. The rules differ for customers and
 * staff, so a plain rank comparison is not enough:
 *
 * - customer accounts are looked after by managers (view, fix details) and
 *   admins (view, fix details, deactivate, delete). The superadmin can look
 *   but does not touch them.
 * - staff accounts: only strictly higher ranks act on them (admins on
 *   managers, the superadmin on admins and managers). Nobody acts on
 *   themselves or an equal.
 */

/** Open and read an account. */
export const canView = (actor: Role, target: Role): boolean =>
  target === Role.CUSTOMER
    ? isStaff(actor)
    : rankOf(actor) > rankOf(target) && actor !== Role.MANAGER;

/** Change someone's profile details (name, phone, address). */
export const canEditProfile = (actor: Role, target: Role): boolean =>
  target === Role.CUSTOMER
    ? actor === Role.MANAGER || actor === Role.ADMIN
    : (actor === Role.ADMIN || actor === Role.SUPERADMIN) &&
      rankOf(actor) > rankOf(target);

/** Deactivate, activate, delete or restore an account. */
export const canGovern = (actor: Role, target: Role): boolean =>
  target === Role.CUSTOMER
    ? actor === Role.ADMIN
    : (actor === Role.ADMIN || actor === Role.SUPERADMIN) &&
      rankOf(actor) > rankOf(target);

/** Change an account's role to `next`. */
export const canAssign = (actor: Role, target: Role, next: Role): boolean =>
  rankOf(actor) > rankOf(target) && ASSIGNABLE[actor].includes(next);
