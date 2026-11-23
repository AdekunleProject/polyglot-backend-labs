import { Role } from './enums/role.enum';
import {
  canAssign,
  canEditProfile,
  canGovern,
  canView,
  rolesBelow,
} from './role-policy';

const { SUPERADMIN, ADMIN, MANAGER, CUSTOMER } = Role;

describe('role policy', () => {
  it('lists the roles below a role', () => {
    expect(rolesBelow(SUPERADMIN).sort()).toEqual([ADMIN, MANAGER, CUSTOMER].sort());
    expect(rolesBelow(ADMIN).sort()).toEqual([MANAGER, CUSTOMER].sort());
    expect(rolesBelow(MANAGER)).toEqual([CUSTOMER]);
    expect(rolesBelow(CUSTOMER)).toEqual([]);
  });

  describe('customer accounts', () => {
    it('are viewed by every staff role, edited by managers and admins, and governed by admins only', () => {
      for (const actor of [MANAGER, ADMIN, SUPERADMIN]) expect(canView(actor, CUSTOMER)).toBe(true);
      expect(canView(CUSTOMER, CUSTOMER)).toBe(false);

      expect(canEditProfile(MANAGER, CUSTOMER)).toBe(true);
      expect(canEditProfile(ADMIN, CUSTOMER)).toBe(true);
      expect(canEditProfile(SUPERADMIN, CUSTOMER)).toBe(false);

      expect(canGovern(ADMIN, CUSTOMER)).toBe(true);
      expect(canGovern(MANAGER, CUSTOMER)).toBe(false);
      expect(canGovern(SUPERADMIN, CUSTOMER)).toBe(false);
    });
  });

  describe('staff accounts', () => {
    it('are only reached by a strictly higher rank', () => {
      expect(canView(ADMIN, MANAGER)).toBe(true);
      expect(canView(SUPERADMIN, ADMIN)).toBe(true);
      expect(canView(MANAGER, MANAGER)).toBe(false);
      expect(canView(MANAGER, ADMIN)).toBe(false);
      expect(canView(ADMIN, ADMIN)).toBe(false);

      expect(canEditProfile(ADMIN, MANAGER)).toBe(true);
      expect(canEditProfile(SUPERADMIN, ADMIN)).toBe(true);
      expect(canEditProfile(MANAGER, MANAGER)).toBe(false);
      expect(canEditProfile(ADMIN, ADMIN)).toBe(false);

      expect(canGovern(ADMIN, MANAGER)).toBe(true);
      expect(canGovern(SUPERADMIN, MANAGER)).toBe(true);
      expect(canGovern(SUPERADMIN, ADMIN)).toBe(true);
      expect(canGovern(ADMIN, ADMIN)).toBe(false);
      expect(canGovern(MANAGER, MANAGER)).toBe(false);
    });
  });

  describe('changing a role', () => {
    it('lets the superadmin make admins and managers, never a superadmin', () => {
      expect(canAssign(SUPERADMIN, CUSTOMER, ADMIN)).toBe(true);
      expect(canAssign(SUPERADMIN, MANAGER, ADMIN)).toBe(true);
      expect(canAssign(SUPERADMIN, ADMIN, CUSTOMER)).toBe(true);
      expect(canAssign(SUPERADMIN, CUSTOMER, SUPERADMIN)).toBe(false);
    });

    it('lets an admin make managers, not admins, and not touch another admin', () => {
      expect(canAssign(ADMIN, CUSTOMER, MANAGER)).toBe(true);
      expect(canAssign(ADMIN, MANAGER, CUSTOMER)).toBe(true);
      expect(canAssign(ADMIN, CUSTOMER, ADMIN)).toBe(false);
      expect(canAssign(ADMIN, ADMIN, MANAGER)).toBe(false);
    });

    it('gives managers and customers no say over roles', () => {
      expect(canAssign(MANAGER, CUSTOMER, MANAGER)).toBe(false);
      expect(canAssign(CUSTOMER, CUSTOMER, MANAGER)).toBe(false);
    });
  });
});
