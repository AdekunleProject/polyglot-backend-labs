import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class GqlAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = GqlExecutionContext.create(context).getContext();
    
    if (ctx.extra?.connectionParams) {
      const token = this.extractToken(ctx.extra.connectionParams.Authorization);
      ctx.user = await this.validateToken(token);
      return true;
    }

    if (ctx.req) {
      const token = this.extractToken(ctx.req.headers.authorization);
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
    try {
      return await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid Session Token');
    }
  }
}
