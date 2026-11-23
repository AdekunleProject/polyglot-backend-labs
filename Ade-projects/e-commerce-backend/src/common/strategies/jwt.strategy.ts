import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectModel } from '@nestjs/mongoose';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { CurrentUserInterface } from '../interfaces/current-user.interface';
import { User } from 'src/users/schemas/user.schema';
import { restrictionFor } from 'src/auth/access-restriction';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly requireAdminTwoFactor: boolean;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      ignoreExpiration: false,

      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
    // On by default in production, where staff accounts are worth attacking.
    const setting = configService.get<string>('REQUIRE_ADMIN_2FA');
    this.requireAdminTwoFactor =
      setting !== undefined && setting !== ''
        ? setting === 'true'
        : configService.get('NODE_ENV') === 'production';
  }

  /**
   * Runs after the token's signature is checked. The role comes from the
   * database on every request, not from the token, so a demotion, a
   * deactivation or a deletion takes effect at once instead of when the
   * token runs out.
   */
  async validate(payload: JwtPayload): Promise<CurrentUserInterface> {
    const user = await this.userModel
      .findById(payload.sub)
      .select('email role deactivatedAt deletedAt mustChangePassword twoFactorEnabled');
    if (!user || user.deactivatedAt || user.deletedAt) {
      throw new UnauthorizedException();
    }
    return {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      restriction: restrictionFor(user, this.requireAdminTwoFactor),
    };
  }
}
