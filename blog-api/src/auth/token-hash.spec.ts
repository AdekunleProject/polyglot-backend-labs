import { hashToken } from './token-hash';

describe('hashToken', () => {
  it('is stable and 64 hex characters', () => {
    const hash = hashToken('some.jwt.value');
    expect(hash).toBe(hashToken('some.jwt.value'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('tells apart tokens that share a long common prefix', () => {
    const prefix = 'a'.repeat(100);
    expect(hashToken(`${prefix}1`)).not.toBe(hashToken(`${prefix}2`));
  });
});
