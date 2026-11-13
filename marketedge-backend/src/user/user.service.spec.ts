import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { Role } from '../auth/enum/roles.enum';

function setup() {
  const model = {
    findOne: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findByIdAndDelete: vi.fn(),
    create: vi.fn(async (doc: Record<string, unknown>) => doc),
  };
  return { model, service: new UserService(model as any) };
}

describe('UserService', () => {
  it('creates a verified user with a hashed password and a lower-cased email', async () => {
    const { service, model } = setup();
    model.findOne.mockResolvedValue(null);
    await service.createAdminUser({ username: 'Boss', email: 'Boss@Example.com', password: 'a-long-password-1', role: Role.MANAGER });
    const saved = model.create.mock.calls[0][0];
    expect(saved.email).toBe('boss@example.com');
    expect(saved.isVerified).toBe(true);
    expect(saved.role).toBe(Role.MANAGER);
    expect(saved.passwordHash).not.toBe('a-long-password-1');
  });

  it('defaults a new staff user to the lowest staff role, not admin', async () => {
    const { service, model } = setup();
    model.findOne.mockResolvedValue(null);
    await service.createAdminUser({ username: 'x', email: 'x@example.com', password: 'a-long-password-1' });
    expect(model.create.mock.calls[0][0].role).toBe(Role.AGENT);
  });

  it('refuses a duplicate, including when two requests race (duplicate key error)', async () => {
    const { service, model } = setup();
    model.findOne.mockResolvedValue({ _id: 'existing' });
    await expect(service.createAdminUser({ username: 'x', email: 'x@example.com', password: 'a-long-password-1' })).rejects.toThrow(ConflictException);

    model.findOne.mockResolvedValue(null);
    model.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    await expect(service.createAdminUser({ username: 'x', email: 'x@example.com', password: 'a-long-password-1' })).rejects.toThrow(ConflictException);
  });

  it('answers "not found" for a malformed id instead of crashing with a cast error', async () => {
    const { service } = setup();
    await expect(service.findById('not-an-id')).rejects.toThrow(NotFoundException);
    await expect(service.deleteUser('not-an-id')).rejects.toThrow(NotFoundException);
  });

  it('refuses an update that changes nothing', async () => {
    const { service } = setup();
    await expect(service.updateAdminUser({ id: '64b7f0f2c2a4a1a1a1a1a1a1' })).rejects.toThrow(BadRequestException);
  });

  it('updates only the fields that were sent and enables validators', async () => {
    const { service, model } = setup();

    model.findByIdAndUpdate.mockResolvedValue({ id: 'u' });

    await service.updateAdminUser({
      id: '64b7f0f2c2a4a1a1a1a1a1a1',
      role: Role.MANAGER,
    });

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      '64b7f0f2c2a4a1a1a1a1a1a1',
      { $set: { role: Role.MANAGER } },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('rejects an admin username that is already taken', async () => {
    const { service, model } = setup();

    model.findByIdAndUpdate.mockRejectedValue(
      Object.assign(new Error('Duplicate key'), { code: 11000 }),
    );

    await expect(
      service.updateAdminUser({
        id: '64b7f0f2c2a4a1a1a1a1a1a1',
        username: 'existing-username',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('updates a customer username and trims surrounding whitespace', async () => {
    const { service, model } = setup();

    const userId = '64b7f0f2c2a4a1a1a1a1a1a1';

    model.findByIdAndUpdate.mockResolvedValue({
      id: userId,
      username: 'new-username',
    });

    await service.updateCustomerProfile(userId, {
      username: '  new-username  ',
    });

    expect(model.findByIdAndUpdate).toHaveBeenCalledWith(
      userId,
      { $set: { username: 'new-username' } },
      { returnDocument: 'after', runValidators: true },
    );
  });

  it('rejects a customer username containing only whitespace', async () => {
    const { service, model } = setup();

    await expect(
      service.updateCustomerProfile(
        '64b7f0f2c2a4a1a1a1a1a1a1',
        { username: '     ' },
      ),
    ).rejects.toThrow(BadRequestException);

    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });

    it('rejects an empty customer profile update', async () => {
    const { service, model } = setup();

    await expect(
      service.updateCustomerProfile(
        '64b7f0f2c2a4a1a1a1a1a1a1',
        {},
      ),
    ).rejects.toThrow(BadRequestException);

    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects an invalid customer ID', async () => {
    const { service, model } = setup();

    await expect(
      service.updateCustomerProfile('invalid-id', {
        username: 'new-username',
      }),
    ).rejects.toThrow(NotFoundException);

    expect(model.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it('rejects a customer username that is already taken', async () => {
    const { service, model } = setup();

    model.findByIdAndUpdate.mockRejectedValue(
      Object.assign(new Error('Duplicate key'), { code: 11000 }),
    );

    await expect(
      service.updateCustomerProfile(
        '64b7f0f2c2a4a1a1a1a1a1a1',
        { username: 'existing-username' },
      ),
    ).rejects.toThrow(ConflictException);
  });
  
  it('rejects an update when the customer does not exist', async () => {
    const { service, model } = setup();

    model.findByIdAndUpdate.mockResolvedValue(null);

    await expect(
      service.updateCustomerProfile(
        '64b7f0f2c2a4a1a1a1a1a1a1',
        { username: 'new-username' },
      ),
    ).rejects.toThrow(NotFoundException);
  });
});
