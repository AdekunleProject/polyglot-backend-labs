import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import { Role } from '../auth/roles.enum';
import { normalizeEmail } from '../auth/otp';

/**
 * A fresh database has no admin, and only an admin can create one (the
 * createAdminUser mutation), so the first admin has to come from the
 * environment. Runs once at start-up and does nothing if an admin exists.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    const username = this.config.get<string>('ADMIN_USERNAME', 'admin');

    if (!email || !password) {
      this.logger.warn('ADMIN_EMAIL or ADMIN_PASSWORD is not set: no admin account created.');
      return;
    }

    if (await this.userModel.exists({ role: Role.ADMIN })) return;

    await this.userModel.create({
      username,
      email: normalizeEmail(email),
      passwordHash: await bcrypt.hash(password, 12),
      role: Role.ADMIN,
      isVerified: true,
    });
    this.logger.log(`Created the initial admin account "${username}".`);
  }
}
