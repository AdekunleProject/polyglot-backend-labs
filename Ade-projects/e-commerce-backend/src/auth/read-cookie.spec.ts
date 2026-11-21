import { readCookie } from './read-cookie';

describe('readCookie', () => {
  it('finds a cookie among others', () => {
    expect(readCookie('a=1; password_reset=abc.def; b=2', 'password_reset')).toBe('abc.def');
  });

  it('returns undefined when it is missing or the header is empty', () => {
    expect(readCookie('a=1', 'password_reset')).toBeUndefined();
    expect(readCookie(undefined, 'password_reset')).toBeUndefined();
  });

  it('decodes encoded values and ignores broken ones', () => {
    expect(readCookie('x=a%20b', 'x')).toBe('a b');
    expect(readCookie('x=%E0%A4%A', 'x')).toBeUndefined();
  });
});
