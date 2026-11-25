import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { BCRYPT_SALT_ROUNDS } from '../auth/auth.constant';
import type { AuthUser } from '../auth/auth-user.type';
import { RealtimeService } from '../realtime/realtime.service';
import { FAILS_BEFORE_SIGN_OUT, isWeakPasscode, lockoutSeconds } from './app-lock-policy';
import type { SetAppLockDto, UpdateAppLockDto } from './dto/app-lock.dto';

interface LockRow {
  sessionId: string;
  userId: number;
  passcodeHash: string;
  biometric: boolean;
  autoLockSeconds: number;
  locked: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
}

type Attempt =
  | { ok: true }
  | { ok: false; reason: 'wrong'; attemptsLeft: number; waitSeconds: number }
  | { ok: false; reason: 'waiting'; waitSeconds: number }
  | { ok: false; reason: 'signed_out' };

/**
 * An app lock belongs to one signed-in device. The passcode is the app's own
 * password (never the account password) and is stored only as a bcrypt hash.
 * Face ID or a fingerprint is checked by the phone itself; the server cannot
 * see it, so it only records that the person turned it on and trusts the phone
 * to say it passed. Signing the device out deletes its lock.
 */
@Injectable()
export class AppLockService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  private sid(user: AuthUser) {
    if (!user.sid) throw new BadRequestException('This sign-in has no device to lock');
    return user.sid;
  }

  private async row(sessionId: string): Promise<LockRow | undefined> {
    return ((await this.db.query(`SELECT * FROM app_locks WHERE "sessionId" = $1`, [sessionId])) as LockRow[])[0];
  }

  private view(row?: LockRow) {
    if (!row) return { enabled: false };
    const wait = row.lockedUntil ? Math.max(0, Math.ceil((row.lockedUntil.getTime() - Date.now()) / 1000)) : 0;
    return {
      enabled: true,
      locked: row.locked,
      biometric: row.biometric,
      autoLockSeconds: row.autoLockSeconds,
      tryAgainInSeconds: wait,
    };
  }

  async status(user: AuthUser) {
    return this.view(await this.row(this.sid(user)));
  }

  private async checkNew(user: AuthUser, passcode: string) {
    if (isWeakPasscode(passcode)) throw new BadRequestException('Choose a passcode that is harder to guess');
    const found = (await this.db.query(`SELECT password FROM users WHERE id = $1`, [user.id])) as { password: string | null }[];
    if (found[0]?.password && (await bcrypt.compare(passcode, found[0].password))) {
      throw new BadRequestException('The app lock must be different from your account password');
    }
  }

  async enable(user: AuthUser, dto: SetAppLockDto) {
    const sid = this.sid(user);
    if (await this.row(sid)) throw new BadRequestException('The app lock is already on. Update it instead.');
    await this.checkNew(user, dto.passcode);
    const hash = await bcrypt.hash(dto.passcode, BCRYPT_SALT_ROUNDS);
    await this.db.query(
      `INSERT INTO app_locks ("sessionId", "userId", "passcodeHash", biometric, "autoLockSeconds")
       VALUES ($1, $2, $3, $4, $5)`,
      [sid, user.id, hash, dto.biometric ?? false, dto.autoLockSeconds ?? 60],
    );
    return this.view(await this.row(sid));
  }

  /** Change the settings or the passcode. The current passcode is needed. */
  async update(user: AuthUser, dto: UpdateAppLockDto) {
    const sid = this.sid(user);
    await this.proveOwnership(user, dto.passcode);
    const sets: string[] = [];
    const params: unknown[] = [sid];
    const add = (column: string, value: unknown) => {
      params.push(value);
      sets.push(`"${column}" = $${params.length}`);
    };
    if (dto.biometric !== undefined) add('biometric', dto.biometric);
    if (dto.autoLockSeconds !== undefined) add('autoLockSeconds', dto.autoLockSeconds);
    if (dto.newPasscode) {
      await this.checkNew(user, dto.newPasscode);
      add('passcodeHash', await bcrypt.hash(dto.newPasscode, BCRYPT_SALT_ROUNDS));
    }
    if (sets.length > 0) {
      await this.db.query(`UPDATE app_locks SET ${sets.join(', ')}, "updatedAt" = now() WHERE "sessionId" = $1`, params);
    }
    return this.view(await this.row(sid));
  }

  async disable(user: AuthUser, passcode: string) {
    const sid = this.sid(user);
    await this.proveOwnership(user, passcode);
    await this.db.query(`DELETE FROM app_locks WHERE "sessionId" = $1`, [sid]);
    return { enabled: false };
  }

  /** The app calls this when it locks itself, so the server knows too. */
  async lock(user: AuthUser) {
    const sid = this.sid(user);
    const lock = await this.row(sid);
    if (!lock) throw new NotFoundException('The app lock is not on');
    await this.db.query(`UPDATE app_locks SET locked = true, "updatedAt" = now() WHERE "sessionId" = $1`, [sid]);
    return this.view(await this.row(sid));
  }

  async unlock(user: AuthUser, passcode: string) {
    const sid = this.sid(user);
    const result = await this.attempt(sid, user.id, passcode);
    return this.finish(result, sid);
  }

  /** The phone says Face ID or the fingerprint passed. Only works if the person turned it on. */
  async unlockWithBiometric(user: AuthUser) {
    const sid = this.sid(user);
    const lock = await this.row(sid);
    if (!lock) throw new NotFoundException('The app lock is not on');
    if (!lock.biometric) throw new BadRequestException('Face ID or fingerprint is not turned on for the app lock');
    if (lock.lockedUntil && lock.lockedUntil.getTime() > Date.now()) {
      throw this.waiting(Math.ceil((lock.lockedUntil.getTime() - Date.now()) / 1000));
    }
    await this.db.query(
      `UPDATE app_locks SET locked = false, "failedAttempts" = 0, "lockedUntil" = NULL, "updatedAt" = now() WHERE "sessionId" = $1`,
      [sid],
    );
    return this.view(await this.row(sid));
  }

  private waiting(seconds: number) {
    return new HttpException(
      { statusCode: 429, message: `Too many wrong passcodes. Try again in ${seconds} seconds.`, tryAgainInSeconds: seconds },
      429,
    );
  }

  /** Used by update and disable: right passcode or an error, with the same limits as unlocking. */
  private async proveOwnership(user: AuthUser, passcode: string) {
    const sid = this.sid(user);
    if (!(await this.row(sid))) throw new NotFoundException('The app lock is not on');
    await this.finish(await this.attempt(sid, user.id, passcode, false), sid);
  }

  private async finish(result: Attempt, sid: string) {
    if (result.ok) return this.view(await this.row(sid));
    if (result.reason === 'waiting') throw this.waiting(result.waitSeconds);
    if (result.reason === 'signed_out') {
      this.realtime.disconnectSession(sid);
      throw new UnauthorizedException('Too many wrong passcodes. This device was signed out.');
    }
    if (result.waitSeconds > 0) throw this.waiting(result.waitSeconds);
    throw new HttpException(
      { statusCode: 401, message: 'Wrong passcode', attemptsLeft: result.attemptsLeft },
      401,
    );
  }

  /**
   * One guess, counted even if the server stops half way: the count is saved
   * before any error is thrown. The row is locked so two guesses at once
   * cannot both be counted as the first.
   */
  private async attempt(sessionId: string, userId: number, passcode: string, unlocks = true): Promise<Attempt> {
    return this.db.transaction(async (tx) => {
      const rows = (await tx.query(`SELECT * FROM app_locks WHERE "sessionId" = $1 FOR UPDATE`, [sessionId])) as LockRow[];
      const lock = rows[0];
      if (!lock) throw new NotFoundException('The app lock is not on');
      if (lock.lockedUntil && lock.lockedUntil.getTime() > Date.now()) {
        return { ok: false, reason: 'waiting', waitSeconds: Math.ceil((lock.lockedUntil.getTime() - Date.now()) / 1000) } as const;
      }
      if (await bcrypt.compare(passcode, lock.passcodeHash)) {
        await tx.query(
          `UPDATE app_locks SET "failedAttempts" = 0, "lockedUntil" = NULL, locked = $2, "updatedAt" = now() WHERE "sessionId" = $1`,
          [sessionId, unlocks ? false : lock.locked],
        );
        return { ok: true } as const;
      }
      const failures = lock.failedAttempts + 1;
      if (failures >= FAILS_BEFORE_SIGN_OUT) {
        await tx.query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
        await this.audit.record(userId, 'auth.app_lock_signout', null, { sessionId });
        return { ok: false, reason: 'signed_out' } as const;
      }
      const wait = lockoutSeconds(failures);
      await tx.query(
        `UPDATE app_locks SET "failedAttempts" = $2, "lockedUntil" = CASE WHEN $3 > 0 THEN now() + ($3 || ' seconds')::interval ELSE NULL END,
                "updatedAt" = now() WHERE "sessionId" = $1`,
        [sessionId, failures, String(wait)],
      );
      const untilNextRound = 5 - (failures % 5);
      return { ok: false, reason: 'wrong', attemptsLeft: Math.min(untilNextRound, FAILS_BEFORE_SIGN_OUT - failures), waitSeconds: wait } as const;
    });
  }
}
