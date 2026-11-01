import { createPublicKey, createVerify } from 'crypto';

export interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

export interface ExpectedClaims {
  issuer: string;
  audience: string;
  nowSeconds?: number;
}

function decodePart(part: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/**
 * Verifies an RS256 JSON Web Token (used for Sign in with Apple) against a
 * published key set. Throws when the signature, issuer, audience or expiry
 * is wrong. Returns the claims on success.
 */
export function verifyRs256Jwt(
  token: string,
  keys: readonly Jwk[],
  expected: ExpectedClaims,
): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token.');
  const [headerPart, payloadPart, signaturePart] = parts;

  const header = decodePart(headerPart);
  if (header.alg !== 'RS256') throw new Error('Unsupported algorithm.');

  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new Error('Unknown signing key.');

  const publicKey = createPublicKey({
    key: { kty: jwk.kty, n: jwk.n, e: jwk.e },
    format: 'jwk',
  });
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerPart}.${payloadPart}`);
  verifier.end();
  if (!verifier.verify(publicKey, Buffer.from(signaturePart, 'base64url'))) {
    throw new Error('Bad signature.');
  }

  const claims = decodePart(payloadPart);
  const now = expected.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (claims.iss !== expected.issuer) throw new Error('Wrong issuer.');
  const audience = claims.aud;
  const audienceOk = Array.isArray(audience)
    ? audience.includes(expected.audience)
    : audience === expected.audience;
  if (!audienceOk) throw new Error('Wrong audience.');
  if (typeof claims.exp !== 'number' || claims.exp <= now) {
    throw new Error('Token expired.');
  }

  return claims;
}
