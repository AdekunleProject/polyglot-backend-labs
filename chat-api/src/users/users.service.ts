import { uniqueUsername } from './username';
import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { In, IsNull, Not, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/auth-user.type';
import { FileUpload } from '../aws/aws.file-upload';
import { BCRYPT_SALT_ROUNDS } from '../auth/auth.constant';
import { Session } from '../auth/entities/session.entity';
import { MailService } from '../mail/mail.service';
import { ProfileImageProvider } from '../common/enums/profile-image-provider.enum';
import { Role } from '../common/enums/role.enum';
import { ASSIGNABLE, canManage, isAtLeast, rolesBelow } from '../common/role-policy';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
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
    private readonly audit: AuditService,
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
      username: user.username,
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
      mustChangePassword: user.mustChangePassword,
      deletedAt: user.deletedAt,
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

  /**
   * The account `actor` wants to act on, if their rank allows it: only
   * accounts strictly below their own. Used by every admin action.
   */
  async requireManageable(actor: AuthUser, id: number): Promise<User> {
    const user = await this.usersRepository.findOneBy({ id });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    if (!canManage(actor.role, user.role)) {
      throw new ForbiddenException('You cannot manage this account');
    }
    return user;
  }

  /** Only accounts below the caller's rank are listed. */
  async findAll(actor: AuthUser, query: ListUsersQueryDto) {
    const showDeleted = !!query.deleted && isAtLeast(actor.role, Role.ADMIN);
    const [users, total] = await this.usersRepository.findAndCount({
      where: {
        role: In(rolesBelow(actor.role)),
        deletedAt: showDeleted ? Not(IsNull()) : IsNull(),
      },
      order: { id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items: await Promise.all(users.map((user) => this.toPublic(user))),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOneFor(actor: AuthUser, id: number) {
    return this.toPublic(await this.requireManageable(actor, id));
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
  async createByAdmin(dto: CreateUserDto, actor: AuthUser) {
    const role = dto.role ?? Role.USER;
    if (!ASSIGNABLE[actor.role].includes(role)) {
      throw new ForbiddenException(`You cannot create ${role} accounts`);
    }
    if (await this.usersRepository.findOneBy({ email: dto.email })) {
      throw new ConflictException('Email already in use');
    }
    const defaultPassword = randomBytes(9).toString('base64url');
    const user = await this.usersRepository.save(
      this.usersRepository.create({
        firstname: dto.firstname,
        lastname: dto.lastname,
        username: await uniqueUsername(this.usersRepository, dto.email.split('@')[0]),
        email: dto.email,
        role,
        password: await bcrypt.hash(defaultPassword, BCRYPT_SALT_ROUNDS),
        isVerified: true,
        // The emailed password is only for the first sign-in.
        mustChangePassword: true,
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
      await this.audit.record(actor.id, 'user.create', user.id, { role });
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
    await this.audit.record(actor.id, 'user.create', user.id, { role });
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
      mustChangePassword: false,
    });
    await this.sessionsRepository.delete({ userId });
    return { message: 'Password changed. Please sign in again.' };
  }

  /** An admin or manager edits the profile of an account below them. */
  async updateOther(actor: AuthUser, id: number, dto: UpdateProfileDto) {
    const user = await this.requireManageable(actor, id);
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    Object.assign(user, changes);
    await this.usersRepository.save(user);
    await this.audit.record(actor.id, 'user.update', user.id, {
      fields: Object.keys(changes),
    });
    return {
      message: 'Profile updated successfully',
      user: await this.toPublic(user),
    };
  }

  /**
   * Only accounts below the caller's rank, and only to a role the caller may
   * hand out (see ASSIGNABLE). Nobody can change their own role.
   */
  async changeRole(actor: AuthUser, id: number, role: Role) {
    const user = await this.requireManageable(actor, id);
    if (!ASSIGNABLE[actor.role].includes(role)) {
      throw new ForbiddenException(`You cannot give the ${role} role`);
    }
    if (user.role !== role) {
      const from = user.role;
      user.role = role;
      await this.usersRepository.save(user);
      await this.audit.record(actor.id, 'user.role_change', user.id, { from, to: role });
    }
    return { message: 'Role updated', user: await this.toPublic(user) };
  }

  async setActive(
    targetId: number,
    actor: AuthUser,
    active: boolean,
    reason?: string,
  ) {
    if (!active && targetId === actor.id) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const user = await this.requireManageable(actor, targetId);
    if (user.deletedAt) {
      throw new BadRequestException('This account is deleted. Restore it instead.');
    }
    user.isActive = active;
    await this.usersRepository.save(user);
    if (!active) {
      // Ends refresh tokens at once. Access tokens stop working at once too,
      // because every request checks the account in the database.
      await this.sessionsRepository.delete({ userId: targetId });
    }
    await this.audit.record(
      actor.id,
      active ? 'user.activate' : 'user.deactivate',
      user.id,
      reason ? { reason } : undefined,
    );
    return {
      message: active
        ? 'User account activated successfully'
        : 'User account deactivated successfully',
    };
  }

  /**
   * "Delete" by an admin is soft: the account cannot sign in and disappears
   * from the list, but the row, the posts and the comments stay, so a mistake
   * can be undone with restore.
   */
  async softDelete(actor: AuthUser, id: number, reason?: string) {
    if (id === actor.id) {
      throw new BadRequestException('You cannot delete your own account here');
    }
    const user = await this.requireManageable(actor, id);
    if (!user.deletedAt) {
      await this.usersRepository.update(id, { deletedAt: new Date(), isActive: false });
      await this.sessionsRepository.delete({ userId: id });
      await this.audit.record(actor.id, 'user.delete', id, reason ? { reason } : undefined);
    }
    return { message: 'User account deleted. It can be restored.' };
  }

  async restore(actor: AuthUser, id: number) {
    const user = await this.requireManageable(actor, id);
    if (!user.deletedAt) {
      throw new BadRequestException('This account is not deleted');
    }
    await this.usersRepository.update(id, { deletedAt: null, isActive: true });
    await this.audit.record(actor.id, 'user.restore', id);
    return { message: 'User account restored' };
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
