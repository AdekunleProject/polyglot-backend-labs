
import { UnauthorizedException } from '@nestjs/common';
import { GqlAuthGuard } from './gql-auth.guard';
import { graphqlContext } from '../../common/test-utils';

function guardWith(
  verify: (token: string) => Promise<unknown>,
  sessionExists = true,
) {
  return new GqlAuthGuard(
    { verifyAsync: vi.fn(verify) } as any,
    { exists: vi.fn().mockResolvedValue(sessionExists) } as any,
  );
}

const bearer = (token: string) => ({
  req: { headers: { authorization: `Bearer ${token}` } },
});

describe('GqlAuthGuard', () => {
  it('accepts a valid access token with an active session', async () => {
    const guard = guardWith(async () => ({
      sub: 'u1',
      sid: 'session-1',
      role: 'admin',
      type: 'access',
    }));

    const ctx = bearer('good');

    await expect(guard.canActivate(graphqlContext(ctx))).resolves.toBe(true);
    expect((ctx.req as any).user.sub).toBe('u1');
  });

  it('rejects a refresh token used as an access token', async () => {
    const guard = guardWith(async () => ({
      sub: 'u1',
      sid: 'session-1',
      type: 'refresh',
    }));

    await expect(
      guard.canActivate(graphqlContext(bearer('refresh'))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token without a type claim', async () => {
    const guard = guardWith(async () => ({
      sub: 'u1',
      sid: 'session-1',
    }));

    await expect(
      guard.canActivate(graphqlContext(bearer('old'))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an access token without a session ID', async () => {
    const guard = guardWith(async () => ({
      sub: 'u1',
      type: 'access',
    }));

    await expect(
      guard.canActivate(graphqlContext(bearer('no-sid'))),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a revoked or expired session', async () => {
    const guard = guardWith(
      async () => ({
        sub: 'u1',
        sid: 'session-1',
        type: 'access',
      }),
      false,
    );

    await expect(
      guard.canActivate(graphqlContext(bearer('revoked'))),
    ).rejects.toThrow('Session has been revoked or expired');
  });

  it('rejects an invalid or expired JWT', async () => {
    const guard = guardWith(async () => {
      throw new Error('jwt expired');
    });

    await expect(
      guard.canActivate(graphqlContext(bearer('bad'))),
    ).rejects.toThrow('Invalid Session Token');
  });

  it('rejects missing or malformed authorization headers', async () => {
    const guard = guardWith(async () => ({
      sub: 'u1',
      sid: 'session-1',
      type: 'access',
    }));

    await expect(
      guard.canActivate(graphqlContext({ req: { headers: {} } })),
    ).rejects.toThrow('Missing');

    await expect(
      guard.canActivate(
        graphqlContext({
          req: { headers: { authorization: 'Token abc' } },
        }),
      ),
    ).rejects.toThrow('Malformed');
  });

  it('authenticates a WebSocket subscription with an active session', async () => {
    const guard = guardWith(async () => ({
      sub: 'u2',
      sid: 'session-2',
      role: 'agent',
      type: 'access',
    }));

    const ctx: Record<string, any> = {
      extra: {
        connectionParams: { Authorization: 'Bearer good' },
      },
    };

    await expect(
      guard.canActivate(graphqlContext(ctx)),
    ).resolves.toBe(true);

    expect(ctx.user.sub).toBe('u2');
  });

  it('denies a context without a request or connection params', async () => {
    const guard = guardWith(async () => ({
      sub: 'u1',
      sid: 'session-1',
      type: 'access',
    }));

    await expect(
      guard.canActivate(graphqlContext({})),
    ).resolves.toBe(false);
  });
});
