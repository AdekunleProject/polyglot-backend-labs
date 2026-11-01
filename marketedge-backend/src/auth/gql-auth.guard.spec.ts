import { UnauthorizedException } from '@nestjs/common';
import { GqlAuthGuard } from './gql-auth.guard';
import { graphqlContext } from '../common/test-utils';

function guardWith(verify: (token: string) => Promise<unknown>) {
  return new GqlAuthGuard({ verifyAsync: vi.fn(verify) } as any);
}
const bearer = (token: string) => ({ req: { headers: { authorization: `Bearer ${token}` } } });

describe('GqlAuthGuard', () => {
  it('accepts a valid access token and attaches the user', async () => {
    const guard = guardWith(async () => ({ sub: 'u1', role: 'admin', type: 'access' }));
    const ctx = bearer('good');
    await expect(guard.canActivate(graphqlContext(ctx))).resolves.toBe(true);
    expect((ctx.req as any).user.sub).toBe('u1');
  });

  it('rejects a refresh token used as an access token', async () => {
    const guard = guardWith(async () => ({ sub: 'u1', type: 'refresh' }));
    await expect(guard.canActivate(graphqlContext(bearer('refresh')))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token without a type claim (an old token)', async () => {
    const guard = guardWith(async () => ({ sub: 'u1' }));
    await expect(guard.canActivate(graphqlContext(bearer('old')))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an invalid or expired token', async () => {
    const guard = guardWith(async () => {
      throw new Error('jwt expired');
    });
    await expect(guard.canActivate(graphqlContext(bearer('bad')))).rejects.toThrow('Invalid Session Token');
  });

  it('rejects a missing or malformed header', async () => {
    const guard = guardWith(async () => ({ type: 'access' }));
    await expect(guard.canActivate(graphqlContext({ req: { headers: {} } }))).rejects.toThrow('Missing');
    await expect(
      guard.canActivate(graphqlContext({ req: { headers: { authorization: 'Token abc' } } })),
    ).rejects.toThrow('Malformed');
  });

  it('authenticates a WebSocket subscription from its connection params', async () => {
    const guard = guardWith(async () => ({ sub: 'u2', role: 'agent', type: 'access' }));
    const ctx: Record<string, any> = { extra: { connectionParams: { Authorization: 'Bearer good' } } };
    await expect(guard.canActivate(graphqlContext(ctx))).resolves.toBe(true);
    expect(ctx.user.sub).toBe('u2');
  });

  it('denies a context that has neither a request nor connection params', async () => {
    const guard = guardWith(async () => ({ type: 'access' }));
    await expect(guard.canActivate(graphqlContext({}))).resolves.toBe(false);
  });
});
