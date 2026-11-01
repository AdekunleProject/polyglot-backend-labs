import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Jwk, verifyRs256Jwt } from './jwt-rs256';

export interface SocialIdentity {
  email: string;
  providerId: string;
}

const GOOGLE_TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';
const APPLE_KEYS = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';

/**
 * Checks a Google or Apple ID token with the provider and returns the verified
 * identity. Before this existed, the API accepted any email and provider id
 * from the client, so anyone could log in as any user, including an admin.
 */
@Injectable()
export class SocialTokenVerifier {
  /** Replaced in tests. */
  fetchFn: typeof fetch = (...args) => fetch(...args);

  constructor(private readonly config: ConfigService) {}

  async verifyGoogle(idToken: string): Promise<SocialIdentity> {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    if (!clientId) throw new UnauthorizedException('Google sign-in is not configured.');

    const response = await this.fetchFn(`${GOOGLE_TOKENINFO}?id_token=${encodeURIComponent(idToken)}`);
    if (!response.ok) throw new UnauthorizedException('Invalid Google token.');

    const claims = (await response.json()) as Record<string, unknown>;
    const issuerOk = claims.iss === 'accounts.google.com' || claims.iss === 'https://accounts.google.com';
    const emailVerified = claims.email_verified === true || claims.email_verified === 'true';

    if (
      claims.aud !== clientId ||
      !issuerOk ||
      !emailVerified ||
      typeof claims.email !== 'string' ||
      typeof claims.sub !== 'string'
    ) {
      throw new UnauthorizedException('Invalid Google token.');
    }
    return { email: claims.email, providerId: claims.sub };
  }

  async verifyApple(idToken: string): Promise<SocialIdentity> {
    const clientId = this.config.get<string>('APPLE_CLIENT_ID');
    if (!clientId) throw new UnauthorizedException('Apple sign-in is not configured.');

    const response = await this.fetchFn(APPLE_KEYS);
    if (!response.ok) throw new UnauthorizedException('Could not verify the Apple token.');
    const { keys } = (await response.json()) as { keys: Jwk[] };

    let claims: Record<string, unknown>;
    try {
      claims = verifyRs256Jwt(idToken, keys, { issuer: APPLE_ISSUER, audience: clientId });
    } catch {
      throw new UnauthorizedException('Invalid Apple token.');
    }

    const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
    if (!emailVerified || typeof claims.email !== 'string' || typeof claims.sub !== 'string') {
      throw new UnauthorizedException('Invalid Apple token.');
    }
    return { email: claims.email, providerId: claims.sub };
  }
}
