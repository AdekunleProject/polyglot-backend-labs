import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EmailThrottlerGuard, THROTTLE_BY_EMAIL } from './email-throttler.guard';

function guardWith(flag: boolean | undefined) {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) =>
    key === THROTTLE_BY_EMAIL ? flag : undefined,
  );
  return new EmailThrottlerGuard({ throttlers: [] } as any, {} as any, reflector);
}

function contextWith(body: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ body }) }),
  } as unknown as ExecutionContext;
}

describe('EmailThrottlerGuard', () => {
  it('ignores routes that are not marked', async () => {
    await expect(guardWith(undefined).canActivate(contextWith({ email: 'a@b.co' }))).resolves.toBe(true);
  });

  it('ignores a marked route when the body has no email', async () => {
    await expect(guardWith(true).canActivate(contextWith({}))).resolves.toBe(true);
  });

  it('counts the same address however it is written', async () => {
    const guard = guardWith(true) as any;
    expect(await guard.getTracker({ body: { email: ' Ada@Example.COM ' } })).toBe('email:ada@example.com');
  });
});
