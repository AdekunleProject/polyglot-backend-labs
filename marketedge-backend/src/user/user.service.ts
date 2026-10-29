// src/user/user.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import { CreateAdminUserInput, UpdateAdminUserInput } from '../user/dto/user.admin.input';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async createAdminUser(input: CreateAdminUserInput): Promise<User> {
    const passwordHash = await bcrypt.hash(input.password, 10);
    return await this.userModel.create({
      username: input.username,
      email: input.email,
      passwordHash,
      role: input.role,
      isVerified: true, // Administrative creations bypass traditional registration loops
    });
  }

  async updateAdminUser(input: UpdateAdminUserInput): Promise<User> {
    const user = await this.userModel.findByIdAndUpdate(
      input.id,
      { $set: { username: input.username, role: input.role } },
      { new: true }
    );
    if (!user) throw new NotFoundException('Target user profile matching key metadata missing.');
    return user;
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User profile context not found.');
    return user;
  }

  async findByEmail(email: string): Promise<User> {
    const user = await this.userModel.findOne({ email });
    if (!user) throw new NotFoundException('User profile matching target email not found.');
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await this.userModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('Target user profile not found.');
    return true;
  }
}
