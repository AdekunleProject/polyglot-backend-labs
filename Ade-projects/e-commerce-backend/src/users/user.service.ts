import { randomBytes } from 'crypto';
import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';

import { Model, PipelineStage, Types } from 'mongoose';
import { Module } from '@nestjs/common';

import * as bcrypt from 'bcryptjs';

import { User, UserSchema } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user-dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { CreateAdminProfileDto } from './dto/create-adminProfile.dto';
import { FileUpload } from 'src/aws/aws.file-upload';
import { ProfileImageProvider } from '../common/enums/profile-image-provider.enum';
import { url } from 'inspector';
import { NotificationsService } from 'src/notifications/notification.service';
import { NotificationType } from 'src/notifications/schemas/notification.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly fileUpload: FileUpload,
    private readonly notificationsService: NotificationsService,
  ) {}
  // SECURITY FIX: this saved `data` straight into the User model with no
  // password hashing at all — every account created through this
  // endpoint had its plaintext password stored directly in the
  // database. Compare to AuthService.signup(), which correctly does
  // bcrypt.hash() before saving. As a second-order effect, login would
  // never have worked for these accounts either, since
  // AuthService.login() compares via bcrypt.compare(), which can't
  // match against a plaintext value.
  async create(data: CreateUserDto) {
    try {
      const hashedPassword = await bcrypt.hash(data.password, 12);
      const user = new this.userModel({ ...data, password: hashedPassword });
      if (!user) {
        throw new NotFoundException('Not found');
      }
      console.log('Created');
      return user.save();
    } catch (error) {
      console.log(error);
      throw new NotFoundException(error);
    }
  }

  private async resolveProfileImage(user: User): Promise<string | undefined> {
    if (!user.profileImage) {
      return undefined;
    }

    if (user.profileImageProvider === ProfileImageProvider.GOOGLE) {
      return user.profileImage;
    }

    return this.fileUpload.getDownloadUrl(user.profileImage);
  }

  async findById(userId: string) {
    try {
      const user = await this.userModel.findById(userId).exec();
      if (!user) {
        throw new NotFoundException('Not found');
      }
      console.log('Searched');
      const profileImage = await this.resolveProfileImage(user);

      return {
        ...user.toObject(),
        profileImage,
      };
    } catch (error) {
      console.log(error);
      throw new NotFoundException(error);
    }
  }

  async findByEmail(email: string) {
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    const profileImage = await this.resolveProfileImage(user);
    return {
      ...user.toObject(),
      profileImage,
    };
  }

  async findAll() {
    try {
      const user = await this.userModel.find();
      if (!user) {
        throw new NotFoundException('Not found');
      }
      console.log('Searched all');
      return user;
    } catch (error) {
      console.log(error);
      throw new NotFoundException(error);
    }
  }

  // SECURITY FIX: same issue as create() above — if `password` was
  // included in the update body, it went straight into the database
  // unhashed. Reachable by any authenticated user via PUT /users (their
  // own account), not just the unguarded endpoint — a "change password"
  // feature built against this generic update route would have silently
  // stored a plaintext password.
  async update(userId: string, update: UpdateUserDto) {
    try {
      const payload: UpdateUserDto = { ...update };
      if (payload.password) {
        payload.password = await bcrypt.hash(payload.password, 12);
      }
      const user = await this.userModel
        .findByIdAndUpdate(userId, payload, { new: true })
        .exec();
      if (!user) throw new NotFoundException('User not found');
      await user.save();
      console.log('Updated');
      return user;
    } catch (error) {
      console.log(error);
      throw new NotFoundException(error);
    }
  }

  //DELETE USER
  async remove(id: string) {
    try {
      const deleted = await this.userModel.findByIdAndDelete(id).exec();
      if (!deleted) throw new NotFoundException('User not found');

      return deleted;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to delete user');
    }
  }

  async getUserProfile(userId: string) {
    try {
      const user = await this.userModel.findById(userId);

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const profileImage = await this.resolveProfileImage(user);
      return {
        firstName: user.firstname,
        lastName: user.lastname,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        address: user.address,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profileImage,
      };
    } catch (error) {
      throw new NotFoundException(error);
    }
  }

  async updateCustomerProfile(
    userId: string,
    updateCustomerProfileDto: UpdateCustomerProfileDto,
    image?: Express.Multer.File,
  ) {
    try {
      const user = await this.userModel.findByIdAndUpdate(
        userId,
        { $set: updateCustomerProfileDto },
        { new: true },
      );

      if (!user) {
        throw new NotFoundException('User not found');
      }
      if (image) {
        user.profileImage = await this.fileUpload.uploadFile(image, 'users');
      }
      await user.save();
      const profileImage = await this.resolveProfileImage(user);

      await this.notificationsService.notifyUser(
        user._id,
        NotificationType.PROFILE_UPDATED,
        'Profile updated',
        'Your profile details were updated.',
      );

      return {
        message: 'Profile updated successfully',
        user: {
          ...user.toObject(),
          profileImage,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update profile');
    }
  }

  async createAdminProfile(
    userId: string,
    createAdminProfileDto: CreateAdminProfileDto,
  ) {
    const admin = await this.userModel.findById(userId);
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }
    const existingUser = await this.userModel.findOne({
      email: createAdminProfileDto.email,
    });
    if (existingUser) {
      throw new BadRequestException('User already exists');
    }
    const defaultPassword = randomBytes(9).toString('base64url');
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);

    const user = new this.userModel({
      firstname: createAdminProfileDto.firstname,
      lastname: createAdminProfileDto.lastname,
      email: createAdminProfileDto.email,
      password: hashedPassword,
      role: createAdminProfileDto.role,
      isVerified: true,
      // profileImage: String
    });
    await user.save();

    await this.notificationsService.notifyUser(
      user._id,
      NotificationType.ADMIN_PROFILE_CREATED,
      'Admin account created',
      `Welcome, ${user.firstname}! Your admin account has been created.`,
    );

    await this.notificationsService.notifyAdmins(
      NotificationType.ADMIN_PROFILE_CREATED,
      'New admin added',
      `${user.firstname} ${user.lastname} was added as an admin.`,
      '/admin/users',
      user._id,
    );

    return {
      message: 'User created successfully',
      defaultPassword,
      user: {
        id: user._id,
        firstname: user.firstname,
        lastname: user.lastname,
        email: user.email,
        role: user.role,
      },
    };
  }

  //DEACTIVE USER
  async deactivateUser(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    user.isActive = false;
    await user.save();

    await this.notificationsService.notifyUser(
      user._id,
      NotificationType.ACCOUNT_DEACTIVATED,
      'Account deactivated',
      'Your account has been deactivated. Contact support if you believe this is a mistake.',
    );

    return {
      message: 'User account deactivated successfully',
    };
  }
}
