import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { BCRYPT_SALT_ROUNDS } from '../auth/auth.constant';
import { Role } from '../common/enums/role.enum';
import { User } from './entities/user.entity';

/**
 * Creates the first admin from ADMIN_EMAIL and ADMIN_PASSWORD when the app
 * starts, so nobody has to edit the database by hand. It does nothing if the
 * variables are unset or the account already exists.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) return;
    if (await this.usersRepository.findOneBy({ email })) return;

    await this.usersRepository.save(
      this.usersRepository.create({
        name: 'Admin',
        email,
        password: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS),
        role: Role.ADMIN,
        isVerified: true,
      }),
    );
    this.logger.log(`Admin account created for ${email}`);
  }
}
