import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { gunzipSync, gzipSync } from 'zlib';

/**
 * File layout: "CHATBK1" | salt (16) | iv (12) | auth tag (16) | ciphertext.
 * The key comes from the person's backup password (scrypt), so the server
 * never keeps anything that can open the archive.
 */
const MAGIC = Buffer.from('CHATBK1');
const SALT = 16;
const IV = 12;
const TAG = 16;

const keyFrom = (password: string, salt: Buffer) =>
  scryptSync(password, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });

export function encryptBackup(data: unknown, password: string): Buffer {
  const salt = randomBytes(SALT);
  const iv = randomBytes(IV);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(password, salt), iv);
  const body = Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(data)))), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

/** Throws when the password is wrong or the file was changed. */
export function decryptBackup<T = unknown>(file: Buffer, password: string): T {
  if (file.length < MAGIC.length + SALT + IV + TAG || !file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error('Not a chat backup file');
  }
  let at = MAGIC.length;
  const salt = file.subarray(at, (at += SALT));
  const iv = file.subarray(at, (at += IV));
  const tag = file.subarray(at, (at += TAG));
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(password, salt), iv);
  decipher.setAuthTag(tag);
  try {
    const plain = Buffer.concat([decipher.update(file.subarray(at)), decipher.final()]);
    return JSON.parse(gunzipSync(plain).toString('utf8')) as T;
  } catch {
    throw new Error('Wrong password, or the backup was changed');
  }
}
