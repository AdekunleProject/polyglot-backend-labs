import { createSign, generateKeyPairSync } from 'crypto';
import { verifyRs256Jwt } from './jwt-rs256';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' }) as { kty: string; n: string; e: string };
const keys = [{ kid: 'test-key', kty: jwk.kty, n: jwk.n, e: jwk.e }];

const ISSUER = 'https://appleid.apple.com';
const AUDIENCE = 'com.example.app';
const NOW = 1_800_000_000;

function sign(
  claims: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', kid: 'test-key' },
  key = privateKey,
): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const body = `${encode(header)}.${encode(claims)}`;
  const signature = createSign('RSA-SHA256').update(body).sign(key).toString('base64url');
  return `${body}.${signature}`;
}

const good = { iss: ISSUER, aud: AUDIENCE, sub: 'user-1', exp: NOW + 600 };
const expected = { issuer: ISSUER, audience: AUDIENCE, nowSeconds: NOW };

describe('verifyRs256Jwt', () => {
  it('accepts a correctly signed token and returns its claims', () => {
    expect(verifyRs256Jwt(sign(good), keys, expected).sub).toBe('user-1');
  });

  it('rejects a token signed with a different key', () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect(() => verifyRs256Jwt(sign(good, undefined, other), keys, expected)).toThrow(
      'Bad signature',
    );
  });

  it('rejects a token whose body was changed after signing', () => {
    const [h, , s] = sign(good).split('.');
    const forged = Buffer.from(JSON.stringify({ ...good, sub: 'admin' })).toString('base64url');
    expect(() => verifyRs256Jwt(`${h}.${forged}.${s}`, keys, expected)).toThrow(
      'Bad signature',
    );
  });

  it('rejects the wrong audience, the wrong issuer and an expired token', () => {
    expect(() => verifyRs256Jwt(sign({ ...good, aud: 'other' }), keys, expected)).toThrow('audience');
    expect(() => verifyRs256Jwt(sign({ ...good, iss: 'https://evil.test' }), keys, expected)).toThrow('issuer');
    expect(() => verifyRs256Jwt(sign({ ...good, exp: NOW - 1 }), keys, expected)).toThrow('expired');
  });

  it('rejects an unknown key id and the "none" algorithm', () => {
    expect(() => verifyRs256Jwt(sign(good, { alg: 'RS256', kid: 'nope' }), keys, expected)).toThrow('Unknown signing key');
    const unsigned = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(good)).toString('base64url')}.`;
    expect(() => verifyRs256Jwt(unsigned, keys, expected)).toThrow('Unsupported algorithm');
  });

  it('rejects a malformed token', () => {
    expect(() => verifyRs256Jwt('abc', keys, expected)).toThrow('Malformed');
  });
});
