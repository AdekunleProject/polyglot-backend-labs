import * as bcrypt from 'bcrypt';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { Role } from '../auth/roles.enum';

function setup(env: Record<string, string>, adminExists: boolean) {
  const model = { exists: vi.fn().mockResolvedValue(adminExists ? { _id: 'a' } : null), create: vi.fn() };
  const config = { get: (key: string, fallback?: string) => env[key] ?? fallback };
  return { model, service: new AdminBootstrapService(model as any, config as any) };
}

describe('AdminBootstrapService', () => {
  it('creates the first admin from the environment on an empty database', async () => {
    const { service, model } = setup({ ADMIN_EMAIL: 'Root@Example.com', ADMIN_PASSWORD: 'a-long-admin-password' }, false);
    await service.onApplicationBootstrap();
    const saved = model.create.mock.calls[0][0];
    expect(saved.role).toBe(Role.ADMIN);
    expect(saved.email).toBe('root@example.com');
    expect(saved.isVerified).toBe(true);
    expect(saved.username).toBe('admin');
    expect(await bcrypt.compare('a-long-admin-password', saved.passwordHash)).toBe(true);
  });

  it('does nothing when an admin already exists', async () => {
    const { service, model } = setup({ ADMIN_EMAIL: 'a@b.com', ADMIN_PASSWORD: 'x'.repeat(20) }, true);
    await service.onApplicationBootstrap();
    expect(model.create).not.toHaveBeenCalled();
  });

  it('does nothing when the settings are missing', async () => {
    const { service, model } = setup({}, false);
    await service.onApplicationBootstrap();
    expect(model.create).not.toHaveBeenCalled();
  });
});
