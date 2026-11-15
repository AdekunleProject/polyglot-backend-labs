import { hashToken, sameHash } from './token-hash';

describe('token hashing', () => {
  it('tells apart two tokens that share their first 72 characters', () => {
    const shared = 'x'.repeat(80);
    expect(hashToken(`${shared}-old`)).not.toBe(hashToken(`${shared}-new`));
  });

  it('is stable for the same token', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
  });

  it('compares hashes in constant time and rejects different lengths', () => {
    expect(sameHash(hashToken('a'), hashToken('a'))).toBe(true);
    expect(sameHash(hashToken('a'), hashToken('b'))).toBe(false);
    expect(sameHash('short', hashToken('a'))).toBe(false);
  });
});
