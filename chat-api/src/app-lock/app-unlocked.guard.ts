import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AuthUser } from '../auth/auth-user.type';

/**
 * Put after JwtAuthGuard on routes that move money or data. When this device
 * has an app lock and it is locked, the answer is 423 until the person unlocks.
 * A device with no lock is not affected.
 */
@Injectable()
export class AppUnlockedGuard implements CanActivate {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user?.sid) return true;
    const rows = (await this.db.query(`SELECT locked FROM app_locks WHERE "sessionId" = $1`, [user.sid])) as {
      locked: boolean;
    }[];
    if (rows[0]?.locked) {
      throw new HttpException({ statusCode: 423, message: 'The app is locked. Unlock it first.', error: 'Locked' }, 423);
    }
    return true;
  }
}
