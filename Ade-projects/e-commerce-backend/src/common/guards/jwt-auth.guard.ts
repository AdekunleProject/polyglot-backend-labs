import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { isAllowedWhileRestricted } from 'src/auth/access-restriction';
import type { CurrentUserInterface } from '../interfaces/current-user.interface';

const MESSAGES = {
  'change-password':
    'Change your temporary password first (POST /users/me/change-password).',
  'two-factor':
    'Turn on two-factor authentication first (POST /auth/2fa/setup, then /auth/2fa/enable).',
} as const;

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any): any {
    const authenticated = super.handleRequest(err, user, info, context, status) as CurrentUserInterface;
    if (authenticated.restriction) {
      const request = context.switchToHttp().getRequest<Request>();
      if (!isAllowedWhileRestricted(authenticated.restriction, request.method, request.path)) {
        throw new ForbiddenException(MESSAGES[authenticated.restriction]);
      }
    }
    return authenticated;
  }
}
