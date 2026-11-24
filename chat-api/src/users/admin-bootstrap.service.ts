import { uniqueUsername } from './username';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { BCRYPT_SALT_ROUNDS } from '../auth/auth.constant';
import { Role } from '../common/enums/role.enum';
import { User } from './entities/user.entity';

/**
 * Creates the superadmin from SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD when
 * the app starts (the older ADMIN_EMAIL and ADMIN_PASSWORD names still work),
 * so nobody has to edit the database by hand. This is the only way to get a
 * superadmin: no endpoint can create or promote one. If the email already
 * belongs to an account, that account becomes the superadmin; its password is
 * left alone. It does nothing if the variables are unset.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email =
      this.config.get<string>('SUPERADMIN_EMAIL') ||
      this.config.get<string>('ADMIN_EMAIL');
    const password =
      this.config.get<string>('SUPERADMIN_PASSWORD') ||
      this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) return;

    const existing = await this.usersRepository.findOneBy({ email });
    if (existing) {
      if (existing.role !== Role.SUPERADMIN) {
        await this.usersRepository.update(existing.id, {
          role: Role.SUPERADMIN,
          isVerified: true,
          isActive: true,
          deletedAt: null,
        });
        this.logger.log(`${email} is now the superadmin`);
      }
      return;
    }

    await this.usersRepository.save(
      this.usersRepository.create({
        firstname: 'Super',
        lastname: 'Admin',
        username: await uniqueUsername(this.usersRepository, email.split('@')[0]),
        email,
        password: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS),
        role: Role.SUPERADMIN,
        isVerified: true,
      }),
    );
    this.logger.log(`Superadmin account created for ${email}`);
  }
}
