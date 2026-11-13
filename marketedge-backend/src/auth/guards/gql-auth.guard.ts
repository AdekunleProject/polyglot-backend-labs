import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../../user/schemas/user.schema';

interface AccessTokenPayload {
  sub: string;
  sid: string;
  type: string;
}

@Injectable()
export class GqlAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context).getContext();

    // WebSocket subscriptions: token arrives in connection params.
    const params = ctx.extra?.connectionParams;

    if (params) {
      const token = this.extractToken(
        params.Authorization ?? params.authorization,
      );

      ctx.user = await this.validateToken(token);
      return true;
    }

    if (ctx.req) {
      const token = this.extractToken(ctx.req.headers?.authorization);

      ctx.req.user = await this.validateToken(token);
      return true;
    }

    return false;
  }

  private extractToken(authHeader?: string): string {
    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization Token');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Malformed Token Structure');
    }

    return token;
  }

  private async validateToken(token: string): Promise<AccessTokenPayload> {
    let payload: AccessTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid Session Token');
    }

    // Refresh tokens must never access protected API requests.
    if (
      payload.type !== 'access' ||
      !payload.sub ||
      !payload.sid
    ) {
      throw new UnauthorizedException('Invalid Session Token');
    }

    // Confirm that this access token's session is still active.
    const activeSession = await this.userModel.exists({
      _id: payload.sub,
      refreshSessions: {
        $elemMatch: {
          sessionId: payload.sid,
          expiresAt: { $gt: new Date() },
        },
      },
    });

    if (!activeSession) {
      throw new UnauthorizedException('Session has been revoked or expired');
    }

    return payload;
  }
}