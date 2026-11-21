import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { FileUpload } from '../aws/aws.file-upload';
import { BCRYPT_SALT_ROUNDS } from '../auth/auth.constant';
import { Session } from '../auth/entities/session.entity';
import { MailService } from '../mail/mail.service';
import { ProfileImageProvider } from '../common/enums/profile-image-provider.enum';
import { Role } from '../common/enums/role.enum';
import { ChangePasswordDto } from './dto/change-password.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionsRepository: Repository<Session>,
    private readonly fileUpload: FileUpload,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
  ) {}

  /** A stored image key becomes a 30 minute link. Google pictures are URLs already. */
  private async resolveProfileImage(user: User): Promise<string | undefined> {
    if (!user.profileImage) return undefined;
    if (user.profileImageProvider === ProfileImageProvider.GOOGLE) {
      return user.profileImage;
    }
    try {
      return await this.fileUpload.getDownloadUrl(user.profileImage);
    } catch {
      return undefined;
    }
  }

  /** What the API shows about a user. No password, no internal fields. */
  async toPublic(user: User) {
    return {
      id: user.id,
      firstname: user.firstname,
      middlename: user.middlename,
      lastname: user.lastname,
      email: user.email,
      role: user.role,
      phoneNumber: user.phoneNumber,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      address: user.address,
      jobTitle: user.jobTitle,
      bio: user.bio,
      profileImage: await this.resolveProfileImage(user),
      isVerified: user.isVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      isActive: user.isActive,
      provider: user.provider,
      createdAt: user.createdAt,
    };
  }

  private async findOrFail(id: number): Promise<User> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async findById(id: number) {
    return this.toPublic(await this.findOrFail(id));
  }

  async findAll(page: number, limit: number) {
    const [users, total] = await this.usersRepository.findAndCount({
      order: { id: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: await Promise.all(users.map((user) => this.toPublic(user))),
      total,
      page,
      limit,
    };
  }

  /**
   * Admin creates an account. A one-time password is generated and emailed to
   * the new user, who should change it at once. The account is already
   * verified because an admin vouched for it.
   *
   * The password is not in the response, so the admin never sees it. If mail
   * is not set up: in production the user is not created (there would be no
   * safe way to hand over the password); elsewhere it is returned, so a
   * development setup without a mail server still works.
   */
  async createByAdmin(dto: CreateUserDto) {
    if (await this.usersRepository.findOneBy({ email: dto.email })) {
      throw new ConflictException('Email already in use');
    }
    const defaultPassword = randomBytes(9).toString('base64url');
    const user = await this.usersRepository.save(
      this.usersRepository.create({
        firstname: dto.firstname,
        lastname: dto.lastname,
        email: dto.email,
        role: dto.role ?? Role.USER,
        password: await bcrypt.hash(defaultPassword, BCRYPT_SALT_ROUNDS),
        isVerified: true,
      }),
    );

    const emailed = await this.mailService.sendEmail(
      user.email,
      'Your account has been created',
      [
        `Hello ${user.firstname},`,
        '',
        'An account was created for you.',
        `Email: ${user.email}`,
        `Temporary password: ${defaultPassword}`,
        '',
        'Sign in and change this password straight away.',
      ].join('\n'),
    );
    if (emailed) {
      return {
        message: 'User created. The temporary password was emailed to them.',
        user: await this.toPublic(user),
      };
    }
    if (this.config.get('NODE_ENV') === 'production') {
      await this.usersRepository.delete(user.id);
      throw new ServiceUnavailableException(
        'The email could not be sent, so the user was not created. Check the mail settings and try again.',
      );
    }
    return {
      message:
        'User created. Email is not available here, so the temporary password is shown once (never in production).',
      defaultPassword,
      user: await this.toPublic(user),
    };
  }

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
    image?: Express.Multer.File,
  ) {
    const user = await this.findOrFail(userId);
    // Only the fields that were sent. (Declared but unset DTO fields exist as
    // undefined and would otherwise wipe the stored values.)
    Object.assign(
      user,
      Object.fromEntries(
        Object.entries(dto).filter(([, value]) => value !== undefined),
      ),
    );

    if (image) {
      const previous =
        user.profileImageProvider === ProfileImageProvider.S3
          ? user.profileImage
          : null;
      user.profileImage = await this.fileUpload.uploadFile(image, 'users');
      user.profileImageProvider = ProfileImageProvider.S3;
      if (previous) await this.fileUpload.deleteFile(previous);
    }

    await this.usersRepository.save(user);
    return {
      message: 'Profile updated successfully',
      user: await this.toPublic(user),
    };
  }

  /** Needs the current password, then signs the account out everywhere. */
  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (
      !user.password ||
      !(await bcrypt.compare(dto.currentPassword, user.password))
    ) {
      throw new UnauthorizedException('Current password is wrong');
    }
    await this.usersRepository.update(userId, {
      password: await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS),
    });
    await this.sessionsRepository.delete({ userId });
    return { message: 'Password changed. Please sign in again.' };
  }

  async setActive(targetId: number, actorId: number, active: boolean) {
    if (!active && targetId === actorId) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const user = await this.findOrFail(targetId);
    user.isActive = active;
    await this.usersRepository.save(user);
    if (!active) {
      // Ends refresh tokens at once. An access token already issued works
      // until it expires (JWT_EXPIRES_IN, 15 minutes by default).
      await this.sessionsRepository.delete({ userId: targetId });
    }
    return {
      message: active
        ? 'User account activated successfully'
        : 'User account deactivated successfully',
    };
  }

  async remove(userId: number) {
    const user = await this.findOrFail(userId);
    if (user.profileImageProvider === ProfileImageProvider.S3 && user.profileImage) {
      await this.fileUpload.deleteFile(user.profileImage);
    }
    await this.usersRepository.delete(userId);
    return { deleted: true };
  }
}
