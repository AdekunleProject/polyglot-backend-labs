import { Role } from '../common/enums/role.enum';
import { isAllowedWhileRestricted, restrictionFor } from './access-restriction';

const user = (over: Partial<Parameters<typeof restrictionFor>[0]> = {}) => ({
  role: Role.USER,
  mustChangePassword: false,
  twoFactorEnabled: false,
  ...over,
});

describe('restrictionFor', () => {
  it('asks for a new password first', () => {
    expect(restrictionFor(user({ mustChangePassword: true }), true)).toBe('change-password');
  });

  it('asks admins and superadmins for 2FA when it is required', () => {
    expect(restrictionFor(user({ role: Role.ADMIN }), true)).toBe('two-factor');
    expect(restrictionFor(user({ role: Role.SUPERADMIN }), true)).toBe('two-factor');
    expect(restrictionFor(user({ role: Role.ADMIN, twoFactorEnabled: true }), true)).toBeUndefined();
  });

  it('does not ask managers or users, nor anyone when 2FA is not required', () => {
    expect(restrictionFor(user({ role: Role.MANAGER }), true)).toBeUndefined();
    expect(restrictionFor(user(), true)).toBeUndefined();
    expect(restrictionFor(user({ role: Role.ADMIN }), false)).toBeUndefined();
  });
});

describe('isAllowedWhileRestricted', () => {
  it('allows only the routes needed to fix the restriction', () => {
    expect(isAllowedWhileRestricted('change-password', 'POST', '/users/me/change-password')).toBe(true);
    expect(isAllowedWhileRestricted('change-password', 'GET', '/users/me')).toBe(true);
    expect(isAllowedWhileRestricted('change-password', 'GET', '/posts/mine')).toBe(false);
    expect(isAllowedWhileRestricted('change-password', 'PATCH', '/users/me')).toBe(false);
    expect(isAllowedWhileRestricted('two-factor', 'POST', '/auth/2fa/setup')).toBe(true);
    expect(isAllowedWhileRestricted('two-factor', 'POST', '/users/me/change-password')).toBe(false);
    expect(isAllowedWhileRestricted('two-factor', 'GET', '/users')).toBe(false);
  });
});
