import { createSign, generateKeyPairSync } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { SocialTokenVerifier } from './social-token-verifier';

const config = (values: Record<string, string>) => ({ get: (key: string) => values[key] }) as any;
const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as unknown as Response;

describe('SocialTokenVerifier (Google)', () => {
  const claims = {
    iss: 'https://accounts.google.com',
    aud: 'my-client-id',
    sub: 'google-123',
    email: 'ada@example.com',
    email_verified: 'true',
  };

  function verifier(response: Response, clientId: string | null = 'my-client-id') {
    const instance = new SocialTokenVerifier(config(clientId ? { GOOGLE_CLIENT_ID: clientId } : {}));
    instance.fetchFn = vi.fn(async () => response) as any;
    return instance;
  }

  it('returns the verified identity for a good token', async () => {
    await expect(verifier(json(claims)).verifyGoogle('tok')).resolves.toEqual({
      email: 'ada@example.com',
      providerId: 'google-123',
    });
  });

  it('rejects a token issued for another app', async () => {
    await expect(verifier(json({ ...claims, aud: 'someone-else' })).verifyGoogle('tok')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unverified email and a rejected token', async () => {
    await expect(verifier(json({ ...claims, email_verified: 'false' })).verifyGoogle('tok')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(verifier(json({}, false)).verifyGoogle('tok')).rejects.toThrow(UnauthorizedException);
  });

  it('refuses to work when Google sign-in is not configured', async () => {
    await expect(verifier(json(claims), null).verifyGoogle('tok')).rejects.toThrow('not configured');
  });
});

describe('SocialTokenVerifier (Apple)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; n: string; e: string };
  const keySet = { keys: [{ kid: 'k1', ...jwk }] };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

  function token(claims: Record<string, unknown>) {
    const body = `${encode({ alg: 'RS256', kid: 'k1' })}.${encode(claims)}`;
    return `${body}.${createSign('RSA-SHA256').update(body).sign(privateKey).toString('base64url')}`;
  }
  const good = {
    iss: 'https://appleid.apple.com',
    aud: 'com.example.app',
    sub: 'apple-1',
    email: 'ada@example.com',
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 600,
  };

  function verifier() {
    const instance = new SocialTokenVerifier(config({ APPLE_CLIENT_ID: 'com.example.app' }));
    instance.fetchFn = vi.fn(async () => json(keySet)) as any;
    return instance;
  }

  it('returns the verified identity for a correctly signed token', async () => {
    await expect(verifier().verifyApple(token(good))).resolves.toEqual({
      email: 'ada@example.com',
      providerId: 'apple-1',
    });
  });

  it('rejects an expired token and a token for another app', async () => {
    await expect(verifier().verifyApple(token({ ...good, exp: 1 }))).rejects.toThrow(UnauthorizedException);
    await expect(verifier().verifyApple(token({ ...good, aud: 'other' }))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a forged token signed with a different key', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    const body = `${encode({ alg: 'RS256', kid: 'k1' })}.${encode(good)}`;
    const forged = `${body}.${createSign('RSA-SHA256').update(body).sign(other).toString('base64url')}`;
    await expect(verifier().verifyApple(forged)).rejects.toThrow(UnauthorizedException);
  });
});
