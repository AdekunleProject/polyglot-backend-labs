import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { RecoveryCode } from '../entities/recovery-code.entity';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
  RECOVERY_CODE_COUNT,
} from './recovery-code';
import { decryptSecret, encryptSecret } from './secret-box';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp';

const ISSUER = 'Chat API';
const CHALLENGE_TTL = '5m';

@Injectable()
export class TwoFactorService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(RecoveryCode)
    private readonly recoveryCodes: Repository<RecoveryCode>,
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

  private loadWithSecret(id: number): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect(['user.twoFactorSecret', 'user.password'])
      .where('user.id = :id', { id })
      .getOne();
  }

  /** Step 1: create a secret. It does nothing until a code proves it works. */
  async setup(userId: number) {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');
    if (user.twoFactorEnabled) {
      throw new ConflictException('Two-factor authentication is already on');
    }
    const secret = generateTotpSecret();
    await this.users.update(userId, {
      twoFactorSecret: encryptSecret(secret, this.encryptionKey),
      twoFactorLastStep: null,
    });
    return {
      message:
        'Add this key to your authenticator app, then confirm with a code at POST /auth/2fa/enable.',
      secret,
      otpauthUrl: otpauthUrl(secret, user.email, ISSUER),
    };
  }

  /** Step 2: a valid code turns it on and returns the backup codes, once. */
  async enable(userId: number, code: string) {
    const user = await this.loadWithSecret(userId);
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
    if (step === null) throw new BadRequestException('Invalid authentication code');

    // Only flips from off to on once, even if two requests race.
    const turnedOn = await this.users.update(
      { id: userId, twoFactorEnabled: false },
      { twoFactorEnabled: true, twoFactorLastStep: step },
    );
    if (turnedOn.affected !== 1) {
      throw new ConflictException('Two-factor authentication is already on');
    }
    return {
      message:
        'Two-factor authentication is on. Save these backup codes somewhere safe: each works once and they are not shown again.',
      recoveryCodes: await this.replaceRecoveryCodes(userId),
    };
  }

  /** Needs the password (when there is one) and a current code. */
  async disable(userId: number, code: string, password?: string) {
    const user = await this.loadWithSecret(userId);
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
    await this.users.update(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorLastStep: null,
    });
    await this.recoveryCodes.delete({ userId });
    return { message: 'Two-factor authentication is off' };
  }

  /** Given after the password was right, in place of tokens. */
  async createChallenge(user: Pick<User, 'id'>): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, type: 'two-factor' },
      { secret: this.challengeSecret, expiresIn: CHALLENGE_TTL },
    );
  }

  /** Checks challenge, email and code. Returns the user, ready for tokens. */
  async verifyLogin(email: string, challengeToken: string, code: string): Promise<User> {
    const invalidChallenge = new UnauthorizedException('Invalid or expired challenge');
    let sub: number;
    try {
      const payload = await this.jwt.verifyAsync<{ sub?: number; type?: string }>(
        challengeToken,
        { secret: this.challengeSecret },
      );
      if (payload.type !== 'two-factor' || typeof payload.sub !== 'number') {
        throw invalidChallenge;
      }
      sub = payload.sub;
    } catch {
      throw invalidChallenge;
    }
    const user = await this.loadWithSecret(sub);
    if (
      !user ||
      !user.twoFactorEnabled ||
      user.email.toLowerCase() !== email.trim().toLowerCase()
    ) {
      throw invalidChallenge;
    }
    if (!user.isActive) {
      throw new ForbiddenException('This account has been deactivated');
    }
    if (!(await this.checkCode(user, code))) {
      throw new UnauthorizedException('Invalid authentication code');
    }
    return user;
  }

  // Six digits: an authenticator code, accepted once. Anything else is tried
  // as a backup code, which is deleted when used.
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
      // that is not newer, so it is refused.
      const result = await this.users
        .createQueryBuilder()
        .update(User)
        .set({ twoFactorLastStep: step })
        .where(
          'id = :id AND ("twoFactorLastStep" IS NULL OR "twoFactorLastStep" < :step)',
          { id: user.id, step },
        )
        .execute();
      return result.affected === 1;
    }
    const used = await this.recoveryCodes.delete({
      userId: user.id,
      codeHash: hashRecoveryCode(user.id, typed),
    });
    return used.affected === 1;
  }

  private async replaceRecoveryCodes(userId: number): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.recoveryCodes.delete({ userId });
    await this.recoveryCodes.insert(
      codes.map((code) => ({ userId, codeHash: hashRecoveryCode(userId, code) })),
    );
    return codes;
  }
}
