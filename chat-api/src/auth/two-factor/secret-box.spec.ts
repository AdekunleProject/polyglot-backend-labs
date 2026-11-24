import { decryptSecret, encryptSecret } from './secret-box';

describe('secret-box', () => {
  it('round-trips and never stores the plain text', () => {
    const box = encryptSecret('JBSWY3DPEHPK3PXP', 'key-one');
    expect(box).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(box, 'key-one')).toBe('JBSWY3DPEHPK3PXP');
  });

  it('uses a fresh random IV each time', () => {
    expect(encryptSecret('same', 'k')).not.toBe(encryptSecret('same', 'k'));
  });

  it('fails with the wrong key or a tampered value', () => {
    const box = encryptSecret('secret', 'key-one');
    expect(() => decryptSecret(box, 'key-two')).toThrow();
    expect(() => decryptSecret(box.slice(0, -2) + 'AA', 'key-one')).toThrow();
    expect(() => decryptSecret('garbage', 'key-one')).toThrow();
  });
});
