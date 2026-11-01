import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { Role } from './roles.enum';
import { graphqlContext } from '../common/test-utils';

function guardFor(required: Role[] | undefined) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(required) };
  return new RolesGuard(reflector as any);
}

describe('RolesGuard', () => {
  it('allows a route that needs no role', () => {
    expect(guardFor(undefined).canActivate(graphqlContext({}))).toBe(true);
  });

  it('denies instead of crashing when no user is attached', () => {
    expect(() => guardFor([Role.ADMIN]).canActivate(graphqlContext({}))).toThrow(ForbiddenException);
  });

  it('denies a customer on an admin-only route', () => {
    const ctx = graphqlContext({ req: { user: { role: Role.CUSTOMER } } });
    expect(() => guardFor([Role.ADMIN]).canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows an admin on an admin-only route', () => {
    const ctx = graphqlContext({ req: { user: { role: Role.ADMIN } } });
    expect(guardFor([Role.ADMIN]).canActivate(ctx)).toBe(true);
  });

  it('reads the user from a WebSocket (subscription) context too', () => {
    const ctx = graphqlContext({ user: { role: Role.AGENT } });
    expect(guardFor([Role.AGENT, Role.ADMIN]).canActivate(ctx)).toBe(true);
  });
});
