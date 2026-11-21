import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// The authenticator secret has to be read back to check codes, so it cannot be
// hashed. It is encrypted instead (AES-256-GCM), so a copy of the database
// alone does not hand out working second factors.

const keyFrom = (secret: string) =>
  createHash('sha256').update(`blog-api-2fa:${secret}`).digest();

export function encryptSecret(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), body]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

export function decryptSecret(box: string, secret: string): string {
  const [version, iv, tag, body] = box.split('.');
  if (version !== 'v1' || !iv || !tag || !body) {
    throw new Error('Unrecognised secret format');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyFrom(secret),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
