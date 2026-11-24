import { maskPhone, normalizePhone } from './phone';

describe('phone numbers', () => {
  it('writes every spelling of a number the same way', () => {
    expect(normalizePhone('0803 123 4567')).toBe('+2348031234567');
    expect(normalizePhone('+234 803-123-4567')).toBe('+2348031234567');
    expect(normalizePhone('00234 803 123 4567')).toBe('+2348031234567');
    expect(normalizePhone('(0803) 123.4567')).toBe('+2348031234567');
    expect(normalizePhone('07911 123456', '44')).toBe('+447911123456');
  });

  it('refuses things that are not phone numbers', () => {
    expect(normalizePhone('hello')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('+0123456789')).toBeNull();
    expect(normalizePhone('803123456')).toBeNull();
    expect(normalizePhone('+1234567890123456')).toBeNull();
  });

  it('masks the middle of a number', () => {
    expect(maskPhone('+2348031234567')).toBe('+234••••••4567');
  });
});
