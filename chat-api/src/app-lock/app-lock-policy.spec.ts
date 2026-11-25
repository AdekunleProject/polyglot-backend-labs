import { FAILS_BEFORE_SIGN_OUT, isWeakPasscode, lockoutSeconds } from './app-lock-policy';

describe('app lock policy', () => {
  it('waits only after every fifth wrong guess, longer each round, up to 15 minutes', () => {
    expect([1, 2, 3, 4].map(lockoutSeconds)).toEqual([0, 0, 0, 0]);
    expect(lockoutSeconds(5)).toBe(30);
    expect(lockoutSeconds(6)).toBe(0);
    expect(lockoutSeconds(10)).toBe(60);
    expect(lockoutSeconds(5 * 20)).toBe(900);
    expect(FAILS_BEFORE_SIGN_OUT).toBe(10);
  });

  it('refuses repeated characters and straight number runs', () => {
    for (const weak of ['111111', 'aaaaaa', '123456', '654321', '012345']) expect(isWeakPasscode(weak)).toBe(true);
    for (const fine of ['135790', 'Blue7sky', '482916', '12345a']) expect(isWeakPasscode(fine)).toBe(false);
  });
});
