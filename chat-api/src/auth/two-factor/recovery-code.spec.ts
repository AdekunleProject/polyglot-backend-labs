import {
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from './recovery-code';

describe('recovery codes', () => {
  it('looks like XXXXX-XXXXX without look-alike characters', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateRecoveryCode()).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
    }
  });

  it('hashes the same whatever the typing style', () => {
    expect(hashRecoveryCode(1, 'abcde-fghjk')).toBe(hashRecoveryCode(1, 'ABCDE FGHJK'));
    expect(normalizeRecoveryCode(' ab-cd ')).toBe('ABCD');
  });

  it('is bound to the user', () => {
    expect(hashRecoveryCode(1, 'ABCDE-FGHJK')).not.toBe(hashRecoveryCode(2, 'ABCDE-FGHJK'));
  });
});
