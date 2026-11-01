// src/user/user.service.ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User } from './schemas/user.schema';
import { CreateAdminUserInput, UpdateAdminUserInput } from './dto/user.admin.input';
import { Role } from '../auth/roles.enum';
import { normalizeEmail } from '../auth/otp';

@Injectable()
export class UserService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async createAdminUser(input: CreateAdminUserInput): Promise<User> {
    const email = normalizeEmail(input.email);
    const username = input.username.trim();

    const existing = await this.userModel.findOne({ $or: [{ username }, { email }] });
    if (existing) throw new ConflictException('Username or email already registered.');

    try {
      return await this.userModel.create({
        username,
        email,
        passwordHash: await bcrypt.hash(input.password, 12),
        role: input.role ?? Role.AGENT,
        isVerified: true, // Created by an admin, so no email round-trip.
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        throw new ConflictException('Username or email already registered.');
      }
      throw error;
    }
  }

  async updateAdminUser(input: UpdateAdminUserInput): Promise<User> {
    if (!isValidObjectId(input.id)) throw new NotFoundException('User not found.');

    const changes: Record<string, unknown> = {};
    if (input.username !== undefined) changes.username = input.username.trim();
    if (input.role !== undefined) changes.role = input.role;
    if (Object.keys(changes).length === 0) {
      throw new BadRequestException('Nothing to update.');
    }

    const user = await this.userModel.findByIdAndUpdate(
      input.id,
      { $set: changes },
      { returnDocument: 'after' },
    );
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async findById(id: string): Promise<User> {
    if (!isValidObjectId(id)) throw new NotFoundException('User not found.');
    const user = await this.userModel.findById(id);
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async findByEmail(email: string): Promise<User> {
    const user = await this.userModel.findOne({ email: normalizeEmail(email) });
    if (!user) throw new NotFoundException('User not found.');
    return user;
  }

  async deleteUser(id: string): Promise<boolean> {
    if (!isValidObjectId(id)) throw new NotFoundException('User not found.');
    const result = await this.userModel.findByIdAndDelete(id);
    if (!result) throw new NotFoundException('User not found.');
    return true;
  }
}
