import { decryptBackup, encryptBackup } from './backup-crypto';

describe('backup encryption', () => {
  const data = { hello: 'wörld', chats: [{ id: 1, text: 'مرحبا 👋' }] };

  it('round-trips with the right password', () => {
    expect(decryptBackup(encryptBackup(data, 'correct horse'), 'correct horse')).toEqual(data);
  });

  it('refuses a wrong password', () => {
    expect(() => decryptBackup(encryptBackup(data, 'correct horse'), 'wrong horse')).toThrow(/Wrong password/);
  });

  it('refuses a file that was changed', () => {
    const file = encryptBackup(data, 'pw-12345');
    file[file.length - 1] ^= 1;
    expect(() => decryptBackup(file, 'pw-12345')).toThrow(/Wrong password/);
  });

  it('refuses something that is not a backup, and never stores the text in the clear', () => {
    expect(() => decryptBackup(Buffer.from('nope'), 'x')).toThrow(/Not a chat backup/);
    expect(encryptBackup({ secret: 'plain-text-marker' }, 'pw-12345').includes('plain-text-marker')).toBe(false);
  });

  it('gives a different file every time (random salt and iv)', () => {
    expect(encryptBackup(data, 'pw-12345').equals(encryptBackup(data, 'pw-12345'))).toBe(false);
  });
});
