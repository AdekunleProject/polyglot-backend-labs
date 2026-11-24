import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Role } from '../common/enums/role.enum';
import { UsersService } from './users.service';

function build(options: { emailed: boolean; nodeEnv?: string; exists?: boolean }) {
  const saved = { id: 7, firstname: 'Ada', lastname: 'Okafor', email: 'ada@example.com', role: 'user' };
  const usersRepository = {
    findOneBy: jest.fn().mockResolvedValue(options.exists ? { id: 1 } : null),
    create: jest.fn((value) => value),
    save: jest.fn().mockResolvedValue(saved),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const mail = { sendEmail: jest.fn().mockResolvedValue(options.emailed) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new UsersService(
    usersRepository as never,
    {} as never,
    { getDownloadUrl: jest.fn() } as never,
    mail as never,
    new ConfigService({ NODE_ENV: options.nodeEnv ?? 'test' }),
    audit as never,
  );
  return { service, usersRepository, mail, audit };
}

describe('UsersService.createByAdmin', () => {
  const dto = { firstname: 'Ada', lastname: 'Okafor', email: 'ada@example.com' };
  const superadmin = { id: 1, email: 'root@example.com', role: Role.SUPERADMIN };
  const admin = { id: 2, email: 'admin@example.com', role: Role.ADMIN };

  it('emails the password and keeps it out of the response', async () => {
    const { service, mail } = build({ emailed: true });
    const result = await service.createByAdmin(dto, superadmin);
    expect(result).not.toHaveProperty('defaultPassword');
    expect(JSON.stringify(result)).not.toMatch(/Temporary password/);
    const [to, , text] = mail.sendEmail.mock.calls[0];
    expect(to).toBe('ada@example.com');
    expect(text).toMatch(/Temporary password: \S{12}/);
  });

  it('shows the password only when mail is off and this is not production', async () => {
    const { service } = build({ emailed: false });
    const result = await service.createByAdmin(dto, superadmin);
    expect(result).toHaveProperty('defaultPassword');
  });

  it('refuses, and creates nothing, when mail is off in production', async () => {
    const { service, usersRepository } = build({ emailed: false, nodeEnv: 'production' });
    await expect(service.createByAdmin(dto, superadmin)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(usersRepository.delete).toHaveBeenCalledWith(7);
  });

  it('rejects an email that is already taken', async () => {
    const { service, mail } = build({ emailed: true, exists: true });
    await expect(service.createByAdmin(dto, superadmin)).rejects.toBeInstanceOf(ConflictException);
    expect(mail.sendEmail).not.toHaveBeenCalled();
  });

  it('forces a password change at first sign-in and records who created the account', async () => {
    const { service, usersRepository, audit } = build({ emailed: true });
    await service.createByAdmin(dto, superadmin);
    expect(usersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ mustChangePassword: true, role: Role.USER }),
    );
    expect(audit.record).toHaveBeenCalledWith(1, 'user.create', 7, { role: Role.USER });
  });

  it('lets an admin create a manager but not another admin, and nobody a superadmin', async () => {
    const { service, usersRepository } = build({ emailed: true });
    await expect(service.createByAdmin({ ...dto, role: Role.MANAGER }, admin)).resolves.toBeDefined();
    await expect(
      service.createByAdmin({ ...dto, role: Role.ADMIN }, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.createByAdmin({ ...dto, role: Role.SUPERADMIN }, superadmin),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(usersRepository.save).toHaveBeenCalledTimes(1);
  });
});
