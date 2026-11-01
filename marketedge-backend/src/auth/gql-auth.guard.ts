import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class GqlAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context).getContext();

    // WebSocket subscriptions: the token arrives once, in the connection params.
    const params = ctx.extra?.connectionParams;
    if (params) {
      const token = this.extractToken(params.Authorization ?? params.authorization);
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
    if (!authHeader) throw new UnauthorizedException('Missing Authorization Token');
    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Malformed Token Structure');
    return token;
  }

  private async validateToken(token: string) {
    let payload: { type?: string };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid Session Token');
    }
    // A refresh token lives for days and must never open an API request.
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid Session Token');
    }
    return payload;
  }
}
