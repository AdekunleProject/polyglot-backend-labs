import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { User } from '../../users/schemas/user.schema';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recovery-code';
import { decryptSecret, encryptSecret } from './secret-box';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp';

const ISSUER = 'Harlim ShopAll';
const CHALLENGE_TTL = '5m';

@Injectable()
export class TwoFactorService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  // TWO_FACTOR_KEY if set, so the encryption key can be rotated apart from
  // the login tokens. Otherwise JWT_SECRET.
  private get encryptionKey(): string {
    return (
      this.config.get<string>('TWO_FACTOR_KEY') ??
      this.config.getOrThrow<string>('JWT_SECRET')
    );
  }

  // Not the access-token secret, so a challenge can never pass as an access token.
  private get challengeSecret(): string {
    return `${this.config.getOrThrow<string>('JWT_SECRET')}:two-factor-challenge`;
  }

  /** Step 1: create a secret. It does nothing until a code proves it works. */
  async setup(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.twoFactorEnabled) {
      throw new ConflictException('Two-factor authentication is already on');
    }
    const secret = generateTotpSecret();
    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: {
          twoFactorSecret: encryptSecret(secret, this.encryptionKey),
          twoFactorLastStep: null,
        },
      },
    );
    return {
      message:
        'Add this key to your authenticator app, then confirm with a code at POST /auth/2fa/enable.',
      secret,
      otpauthUrl: otpauthUrl(secret, user.email, ISSUER),
    };
  }

  /** Step 2: a valid code turns it on and returns the backup codes, once. */
  async enable(userId: string, code: string) {
    const user = await this.userModel
      .findById(userId)
      .select('+twoFactorSecret');
    if (!user) throw new NotFoundException('User not found');
    if (user.twoFactorEnabled) {
      throw new ConflictException('Two-factor authentication is already on');
    }
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Start with POST /auth/2fa/setup');
    }
    const step = verifyTotp(
      decryptSecret(user.twoFactorSecret, this.encryptionKey),
      normalizeRecoveryCode(code),
    );
    if (step === null) {
      throw new BadRequestException('Invalid authentication code');
    }

    const recoveryCodes = Array.from(
      { length: RECOVERY_CODE_COUNT },
      generateRecoveryCode,
    );
    // Only flips from off to on once, even if two requests race.
    const turnedOn = await this.userModel.updateOne(
      { _id: user._id, twoFactorEnabled: { $ne: true } },
      {
        $set: {
          twoFactorEnabled: true,
          twoFactorLastStep: step,
          recoveryCodes: recoveryCodes.map((c) =>
            hashRecoveryCode(user._id.toString(), c),
          ),
        },
      },
    );
    if (turnedOn.modifiedCount !== 1) {
      throw new ConflictException('Two-factor authentication is already on');
    }
    return {
      message:
        'Two-factor authentication is on. Save these backup codes somewhere safe: each works once and they are not shown again.',
      recoveryCodes,
    };
  }

  /** Needs the password (when there is one) and a current code. */
  async disable(userId: string, code: string, password?: string) {
    const user = await this.userModel
      .findById(userId)
      .select('+password +twoFactorSecret +recoveryCodes');
    if (!user) throw new NotFoundException('User not found');
    if (!user.twoFactorEnabled) {
      throw new BadRequestException('Two-factor authentication is not on');
    }
    if (user.password) {
      if (!password || !(await bcrypt.compare(password, user.password))) {
        throw new UnauthorizedException('Password is wrong');
      }
    }
    if (!(await this.checkCode(user, code))) {
      throw new UnauthorizedException('Invalid authentication code');
    }
    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: {
          twoFactorEnabled: false,
          twoFactorSecret: null,
          twoFactorLastStep: null,
          recoveryCodes: [],
        },
      },
    );
    return { message: 'Two-factor authentication is off' };
  }

  /** Given after the password was right, in place of tokens. */
  createChallenge(user: Pick<User, '_id'>): Promise<string> {
    return this.jwt.signAsync(
      { sub: String(user._id), type: 'two-factor' },
      { secret: this.challengeSecret, expiresIn: CHALLENGE_TTL },
    );
  }

  /** Checks challenge, email and code. Returns the user, ready for tokens. */
  async verifyLogin(
    email: string,
    challengeToken: string,
    code: string,
  ): Promise<User> {
    const invalidChallenge = new UnauthorizedException(
      'Invalid or expired challenge',
    );
    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{
        sub?: string;
        type?: string;
      }>(challengeToken, { secret: this.challengeSecret });
      if (payload.type !== 'two-factor' || typeof payload.sub !== 'string') {
        throw invalidChallenge;
      }
      sub = payload.sub;
    } catch {
      throw invalidChallenge;
    }
    const user = await this.userModel
      .findById(sub)
      .select('+twoFactorSecret +recoveryCodes');
    if (
      !user ||
      !user.twoFactorEnabled ||
      user.email.toLowerCase() !== email.trim().toLowerCase()
    ) {
      throw invalidChallenge;
    }
    if (!(await this.checkCode(user, code))) {
      throw new UnauthorizedException('Invalid authentication code');
    }
    return user;
  }

  // Six digits: an authenticator code, accepted once. Anything else is tried
  // as a backup code, which is removed when used.
  private async checkCode(user: User, code: string): Promise<boolean> {
    const typed = normalizeRecoveryCode(code);
    if (/^\d{6}$/.test(typed)) {
      if (!user.twoFactorSecret) return false;
      const step = verifyTotp(
        decryptSecret(user.twoFactorSecret, this.encryptionKey),
        typed,
      );
      if (step === null) return false;
      // Check and remember in one statement: a code seen before has a step
      // that is not newer, so it matches nothing.
      const result = await this.userModel.updateOne(
        {
          _id: user._id,
          $or: [
            { twoFactorLastStep: null },
            { twoFactorLastStep: { $lt: step } },
          ],
        },
        { $set: { twoFactorLastStep: step } },
      );
      return result.modifiedCount === 1;
    }
    const hash = hashRecoveryCode(user._id.toString(), typed);
    const used = await this.userModel.updateOne(
      { _id: user._id, recoveryCodes: hash },
      { $pull: { recoveryCodes: hash } },
    );
    return used.modifiedCount === 1;
  }
}
