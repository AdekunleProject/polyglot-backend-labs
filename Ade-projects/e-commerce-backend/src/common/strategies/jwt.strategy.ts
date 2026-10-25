import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { CurrentUserInterface } from '../interfaces/current-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      ignoreExpiration: false,

      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  /**
   * This method runs automatically after
   * a token has been validated.
   */
  async validate(payload: JwtPayload): Promise<CurrentUserInterface> {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}
