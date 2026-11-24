import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Session } from './entities/session.entity';
import { restrictionFor } from './access-restriction';
import { AuthUser } from './auth-user.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly requireAdminTwoFactor: boolean;

  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
    // On by default in production, where admin accounts are worth attacking.
    const setting = config.get<string>('REQUIRE_ADMIN_2FA');
    this.requireAdminTwoFactor =
      setting !== undefined && setting !== ''
        ? setting === 'true'
        : config.get('NODE_ENV') === 'production';
  }

  /**
   * The role comes from the database on every request, not from the token, so
   * a demotion, a deactivation or a deletion takes effect at once instead of
   * when the 15 minute token runs out.
   */
  async validate(payload: { sub: number; sid?: string }): Promise<AuthUser> {
    const user = await this.users.findOne({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        deletedAt: true,
        mustChangePassword: true,
        twoFactorEnabled: true,
      },
    });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException();
    }
    // A device that was signed out stops working at once, not when its
    // 15 minute token runs out.
    if (payload.sid) {
      const live = await this.sessions.existsBy({ id: payload.sid, userId: user.id });
      if (!live) throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      sid: payload.sid,
      restriction: restrictionFor(user, this.requireAdminTwoFactor),
    };
  }
}
