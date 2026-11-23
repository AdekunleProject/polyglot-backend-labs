import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User } from './schemas/user.schema';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  async onApplicationBootstrap(): Promise<void> {
    // SUPERADMIN_* is the name now; ADMIN_* still works for older setups.
    const email = process.env.SUPERADMIN_EMAIL ?? process.env.ADMIN_EMAIL;
    const password =
      process.env.SUPERADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
    if (!email || !password) {
      return;
    }
    const existing = await this.userModel.findOne({ email });
    if (existing) {
      return;
    }
    await this.userModel.create({
      firstname: 'Super',
      lastname: 'Admin',
      email,
      password: await bcrypt.hash(password, 12),
      role: Role.SUPERADMIN,
      isVerified: true,
      isActive: true,
    });
    this.logger.log(`Superadmin account created for ${email}`);
  }
}