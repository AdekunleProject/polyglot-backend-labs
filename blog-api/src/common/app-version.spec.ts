import { isOlderVersion } from './app-version';

describe('isOlderVersion', () => {
  it('compares major, minor and patch in order', () => {
    expect(isOlderVersion('1.4.9', '1.5.0')).toBe(true);
    expect(isOlderVersion('1.5.0', '1.5.0')).toBe(false);
    expect(isOlderVersion('2.0.0', '1.9.9')).toBe(false);
    expect(isOlderVersion('1.10.0', '1.9.0')).toBe(false);
    expect(isOlderVersion('0.9.9', '1.0.0')).toBe(true);
  });

  it('treats a malformed app version as too old, and ignores a malformed minimum', () => {
    expect(isOlderVersion('banana', '1.0.0')).toBe(true);
    expect(isOlderVersion('1.0.0', 'banana')).toBe(false);
  });
});
