import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ROLES_KEY } from './roles.decorator.js';
import { Role } from './roles.enum.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const ctx = GqlExecutionContext.create(context).getContext();
    const user = ctx.req?.user || ctx.user;

    if (!user || !user.role) throw new ForbiddenException('No operational roles detected');

    const hasPermission = requiredRoles.includes(user.role);
    if (!hasPermission) throw new ForbiddenException(`Requires roles: [${requiredRoles.join(', ')}]`);

    return true;
  }
}
