import { USERNAME_PATTERN, usernameBase } from './username';

describe('usernameBase', () => {
  it('makes a valid username out of an email name', () => {
    expect(usernameBase('Ada.Lovelace+test')).toBe('ada_lovelace_test');
    expect(USERNAME_PATTERN.test(usernameBase('Ada.Lovelace+test'))).toBe(true);
  });

  it('pads names that are too short and trims long ones', () => {
    expect(USERNAME_PATTERN.test(usernameBase('a'))).toBe(true);
    expect(USERNAME_PATTERN.test(usernameBase('!!'))).toBe(true);
    expect(usernameBase('x'.repeat(80)).length).toBe(24);
  });
});
