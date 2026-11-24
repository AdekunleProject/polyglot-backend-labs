import {
  BadRequestException,
  ConflictException,
  Injectable,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { SecurityNoticeService } from '../security/security-notice.service';
import { User } from '../users/entities/user.entity';
import { normalizePhone } from './phone';
import { SmsService } from './sms.service';

const CODE_TTL_MINUTES = 5;
const COOLDOWN_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;
const MAX_WRONG_GUESSES = 5;

type Purpose = 'login' | 'verify';

@Injectable()
export class PhoneService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly sms: SmsService,
    private readonly auth: AuthService,
    private readonly notice: SecurityNoticeService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private normalize(input: string): string {
    const phone = normalizePhone(input, this.config.get<string>('DEFAULT_COUNTRY_CODE') ?? '234');
    if (!phone) throw new BadRequestException('Enter a valid phone number');
    return phone;
  }

  /** A keyed hash, so a leaked table cannot be brute-forced offline without the server secret. */
  private hash(purpose: Purpose, phone: string, code: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(`phone:${purpose}:${phone}:${code}`)
      .digest('hex');
  }

  /**
   * Makes a code and records it. The limits apply to every number, known or
   * not, so the answer never shows whether a number has an account.
   * Returns the code to send, or null when this request was only counted.
   */
  private async issue(purpose: Purpose, phone: string, userId: number | null) {
    await this.db.query(`DELETE FROM phone_codes WHERE "createdAt" < now() - interval '1 day'`);
    const recent = (await this.db.query(
      `SELECT COUNT(*)::int AS total,
              COALESCE(EXTRACT(EPOCH FROM (now() - MAX("createdAt"))), 9999) AS age
       FROM phone_codes WHERE phone = $1 AND purpose = $2 AND "createdAt" > now() - interval '1 hour'`,
      [phone, purpose],
    )) as { total: number; age: number }[];
    const { total, age } = recent[0];
    if (total >= MAX_CODES_PER_HOUR || Number(age) < COOLDOWN_SECONDS) return { limited: true as const };

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.db.query(
      `INSERT INTO phone_codes (purpose, phone, "userId", "codeHash", "expiresAt")
       VALUES ($1, $2, $3, $4, now() + ($5::int * interval '1 minute'))`,
      [purpose, phone, userId, this.hash(purpose, phone, code), CODE_TTL_MINUTES],
    );
    return { limited: false as const, code };
  }

  /** Returns the userId recorded with the code when it is right, else null. Works once. */
  private async check(purpose: Purpose, phone: string, code: string): Promise<{ userId: number | null } | null> {
    const rows = (await this.db.query(
      `SELECT id, "userId", "codeHash" FROM phone_codes
       WHERE phone = $1 AND purpose = $2 AND "expiresAt" > now() AND attempts < $3
       ORDER BY id DESC LIMIT 1`,
      [phone, purpose, MAX_WRONG_GUESSES],
    )) as { id: number; userId: number | null; codeHash: string }[];
    const row = rows[0];
    if (!row) return null;

    // Count the guess first, so parallel guesses cannot beat the limit.
    const counted = (await this.db.query(
      `UPDATE phone_codes SET attempts = attempts + 1 WHERE id = $1 AND attempts < $2 RETURNING id`,
      [row.id, MAX_WRONG_GUESSES],
    )) as unknown[];
    if (counted.length === 0) return null;

    const expected = Buffer.from(row.codeHash, 'hex');
    const given = Buffer.from(this.hash(purpose, phone, code), 'hex');
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    await this.db.query(`DELETE FROM phone_codes WHERE phone = $1 AND purpose = $2`, [phone, purpose]);
    return { userId: row.userId };
  }

  // ---- Sign in with a phone number (for a laptop or a new phone) ----

  async requestLogin(input: string) {
    const phone = this.normalize(input);
    const user = await this.users.findOne({
      where: { phoneNumber: phone },
      select: { id: true, isActive: true, deletedAt: true, phoneVerifiedAt: true },
    });
    const usable = !!user && !!user.phoneVerifiedAt && user.isActive && !user.deletedAt;
    const issued = await this.issue('login', phone, usable ? user!.id : null);
    if (usable && !issued.limited) {
      await this.sms.send(
        phone,
        `Your sign-in code is ${issued.code}. It expires in ${CODE_TTL_MINUTES} minutes. Never share it with anyone.`,
      );
    }
    // The same answer for every number.
    return { message: 'If that number is registered, a code was sent by SMS.' };
  }

  async verifyLogin(input: string, code: string, deviceName?: string) {
    const phone = this.normalize(input);
    const found = await this.check('login', phone, code);
    if (!found?.userId) throw new UnauthorizedException('Invalid or expired code');

    const user = await this.users.findOneBy({ id: found.userId });
    if (!user || !user.isActive || user.deletedAt || user.phoneNumber !== phone || !user.phoneVerifiedAt) {
      throw new UnauthorizedException('Invalid or expired code');
    }
    await this.audit.record(user.id, 'auth.phone_login', user.id, { deviceName: deviceName ?? null });
    const result = await this.auth.signInOrChallenge(user, deviceName);
    if (!('twoFactorRequired' in result)) await this.notice.newDevice(user.id, deviceName ?? null, 'phone');
    return result;
  }

  // ---- Add a phone number to an account ----

  async addPhone(userId: number, input: string) {
    const phone = this.normalize(input);
    const taken = (await this.db.query(
      `SELECT 1 FROM users WHERE "phoneNumber" = $1 AND "phoneVerifiedAt" IS NOT NULL AND id <> $2`,
      [phone, userId],
    )) as unknown[];
    if (taken.length > 0) throw new ConflictException('That number belongs to another account');

    const issued = await this.issue('verify', phone, userId);
    if (issued.limited) {
      throw new HttpException('Wait a minute before asking for another code', HttpStatus.TOO_MANY_REQUESTS);
    }
    const sent = await this.sms.send(
      phone,
      `Your verification code is ${issued.code}. It expires in ${CODE_TTL_MINUTES} minutes.`,
    );
    if (!sent) throw new ServiceUnavailableException('Could not send the text message. Try again later.');
    return { message: 'A code was sent by SMS.' };
  }

  async confirmPhone(userId: number, input: string, code: string) {
    const phone = this.normalize(input);
    const found = await this.check('verify', phone, code);
    if (!found || found.userId !== userId) throw new BadRequestException('Invalid or expired code');
    try {
      await this.db.query(`UPDATE users SET "phoneNumber" = $2, "phoneVerifiedAt" = now() WHERE id = $1`, [
        userId,
        phone,
      ]);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('That number belongs to another account');
      }
      throw error;
    }
    await this.audit.record(userId, 'auth.phone_add', userId);
    return { message: 'Phone number verified', phoneNumber: phone };
  }

  async removePhone(userId: number) {
    await this.db.query(`UPDATE users SET "phoneNumber" = NULL, "phoneVerifiedAt" = NULL WHERE id = $1`, [userId]);
    return { message: 'Phone number removed' };
  }
}
