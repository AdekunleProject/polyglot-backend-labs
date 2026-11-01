import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserResolver } from './user.resolver';
import { Role } from '../auth/roles.enum';

function setup() {
  const service = {
    createAdminUser: vi.fn().mockResolvedValue({ id: 'new' }),
    updateAdminUser: vi.fn().mockResolvedValue({ id: 'u2' }),
    deleteUser: vi.fn().mockResolvedValue(true),
  };
  return { service, resolver: new UserResolver(service as any) };
}

describe('UserResolver', () => {
  it('stops a manager from changing a role (no self-promotion to admin)', async () => {
    const { resolver, service } = setup();
    await expect(
      resolver.updateAdminUser({ sub: 'm1', role: Role.MANAGER }, { id: 'm1', role: Role.ADMIN }),
    ).rejects.toThrow(ForbiddenException);
    expect(service.updateAdminUser).not.toHaveBeenCalled();
  });

  it('lets a manager rename a user without touching the role', async () => {
    const { resolver, service } = setup();
    await resolver.updateAdminUser({ sub: 'm1', role: Role.MANAGER }, { id: 'u2', username: 'new-name' });
    expect(service.updateAdminUser).toHaveBeenCalled();
  });

  it('lets an admin change a role', async () => {
    const { resolver, service } = setup();
    await resolver.updateAdminUser({ sub: 'a1', role: Role.ADMIN }, { id: 'u2', role: Role.MANAGER });
    expect(service.updateAdminUser).toHaveBeenCalled();
  });

  it('stops an admin deleting their own account', async () => {
    const { resolver, service } = setup();
    await expect(resolver.deleteUser({ sub: 'a1', role: Role.ADMIN }, 'a1')).rejects.toThrow(BadRequestException);
    expect(service.deleteUser).not.toHaveBeenCalled();
  });

  it('lets an admin delete another account', async () => {
    const { resolver } = setup();
    await expect(resolver.deleteUser({ sub: 'a1', role: Role.ADMIN }, 'u2')).resolves.toBe(true);
  });
});
