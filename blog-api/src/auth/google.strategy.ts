import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

export interface GoogleProfile {
  googleId: string;
  email: string;
  firstname: string;
  lastname: string;
  image?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0];
    // Only trust an address Google itself says is verified, since a Google
    // sign-in is allowed to take over an existing account with that email.
    if (!email?.value || email.verified === false) {
      return done(new Error('Google account has no verified email'), false);
    }
    const profileData: GoogleProfile = {
      googleId: profile.id,
      email: email.value,
      firstname:
        profile.name?.givenName ||
        profile.displayName?.split(' ')[0] ||
        email.value.split('@')[0],
      lastname: profile.name?.familyName || '',
      image: profile.photos?.[0]?.value,
    };
    done(null, profileData);
  }
}
