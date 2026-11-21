import { MailTokenPurpose } from '../users/schemas/mail.schema';
import { generateVerificationCode, hashCode } from './verification-code';

describe('verification code', () => {
  it('is 6 characters without look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateVerificationCode()).toMatch(/^[A-HJKMNP-Z2-9]{6}$/);
    }
  });

  it('hashes the same code differently per user and purpose', () => {
    const verify = MailTokenPurpose.VERIFY_EMAIL;
    const reset = MailTokenPurpose.RESET_PASSWORD;
    expect(hashCode('u1', verify, 'ABC234')).toBe(hashCode('u1', verify, 'abc234'));
    expect(hashCode('u1', verify, 'ABC234')).not.toBe(hashCode('u2', verify, 'ABC234'));
    expect(hashCode('u1', verify, 'ABC234')).not.toBe(hashCode('u1', reset, 'ABC234'));
  });
});
