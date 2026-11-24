import { Role } from './enums/role.enum';
import { canAssign, canManage, isAtLeast, rolesBelow } from './role-policy';

describe('role policy', () => {
  it('ranks superadmin > admin > manager > user', () => {
    expect(isAtLeast(Role.SUPERADMIN, Role.ADMIN)).toBe(true);
    expect(isAtLeast(Role.ADMIN, Role.ADMIN)).toBe(true);
    expect(isAtLeast(Role.MANAGER, Role.ADMIN)).toBe(false);
    expect(isAtLeast(Role.USER, Role.MANAGER)).toBe(false);
  });

  it('only lets someone act on accounts strictly below them', () => {
    expect(canManage(Role.SUPERADMIN, Role.ADMIN)).toBe(true);
    expect(canManage(Role.ADMIN, Role.MANAGER)).toBe(true);
    expect(canManage(Role.ADMIN, Role.ADMIN)).toBe(false);
    expect(canManage(Role.MANAGER, Role.ADMIN)).toBe(false);
    expect(canManage(Role.USER, Role.USER)).toBe(false);
  });

  it('lists the roles below a role', () => {
    expect(rolesBelow(Role.SUPERADMIN).sort()).toEqual([Role.ADMIN, Role.MANAGER, Role.USER].sort());
    expect(rolesBelow(Role.MANAGER)).toEqual([Role.USER]);
    expect(rolesBelow(Role.USER)).toEqual([]);
  });

  describe('changing a role', () => {
    it('lets the superadmin make admins, managers and users, but never a superadmin', () => {
      expect(canAssign(Role.SUPERADMIN, Role.USER, Role.ADMIN)).toBe(true);
      expect(canAssign(Role.SUPERADMIN, Role.ADMIN, Role.USER)).toBe(true);
      expect(canAssign(Role.SUPERADMIN, Role.USER, Role.SUPERADMIN)).toBe(false);
    });

    it('lets an admin make managers, but not admins, and not touch another admin', () => {
      expect(canAssign(Role.ADMIN, Role.USER, Role.MANAGER)).toBe(true);
      expect(canAssign(Role.ADMIN, Role.USER, Role.ADMIN)).toBe(false);
      expect(canAssign(Role.ADMIN, Role.ADMIN, Role.USER)).toBe(false);
    });

    it('lets a manager promote a plain user to manager and nothing else', () => {
      expect(canAssign(Role.MANAGER, Role.USER, Role.MANAGER)).toBe(true);
      expect(canAssign(Role.MANAGER, Role.USER, Role.ADMIN)).toBe(false);
      expect(canAssign(Role.MANAGER, Role.MANAGER, Role.USER)).toBe(false);
      expect(canAssign(Role.MANAGER, Role.ADMIN, Role.MANAGER)).toBe(false);
    });

    it('gives a plain user no powers', () => {
      expect(canAssign(Role.USER, Role.USER, Role.MANAGER)).toBe(false);
    });
  });
});
