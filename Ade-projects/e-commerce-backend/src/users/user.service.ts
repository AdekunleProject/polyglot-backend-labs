import { randomBytes } from 'crypto';
import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Inject,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel, MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../helpers/mail/mail-service';

import { QueryFilter, Model, PipelineStage, Types } from 'mongoose';
import { Module } from '@nestjs/common';

import * as bcrypt from 'bcryptjs';

import { User, UserSchema } from './schemas/user.schema';
import { CreateUserDto } from './dto/create-user-dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateCustomerProfileDto } from './dto/update-customer-profile.dto';
import { CreateAdminProfileDto } from './dto/create-adminProfile.dto';
import { FileUpload } from 'src/aws/aws.file-upload';
import { ProfileImageProvider } from '../common/enums/profile-image-provider.enum';
import { NotificationsService } from 'src/notifications/notification.service';
import { NotificationType } from 'src/notifications/schemas/notification.schema';
import { AuditService } from 'src/audit/audit.service';
import type { CurrentUserInterface } from 'src/common/interfaces/current-user.interface';
import { Role } from 'src/common/enums/role.enum';
import {
  ASSIGNABLE,
  canAssign,
  canEditProfile,
  canGovern,
  canView,
  rolesBelow,
} from 'src/common/role-policy';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateOtherProfileDto } from './dto/update-other-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
    private readonly fileUpload: FileUpload,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}
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

  /** What the API shows about someone else's account. No password, no secrets. */
  private async toPublic(user: User) {
    return {
      id: user._id,
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
      profileImage: await this.resolveProfileImage(user),
      isVerified: user.isVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      mustChangePassword: user.mustChangePassword,
      deactivatedAt: user.deactivatedAt ?? null,
      deletedAt: user.deletedAt ?? null,
      provider: user.provider,
      createdAt: (user as unknown as { createdAt?: Date }).createdAt,
    };
  }

  /**
   * The account `actor` wants to act on, if `allowed` says their role may.
   * 404 for an id that does not exist, 403 for one they may not touch.
   */
  private async requireAccess(
    actor: CurrentUserInterface,
    id: string,
    allowed: (actor: Role, target: Role) => boolean,
  ): Promise<User> {
    const user = Types.ObjectId.isValid(id)
      ? await this.userModel.findById(id)
      : null;
    if (!user) throw new NotFoundException('User not found');
    if (!allowed(actor.role, user.role)) {
      throw new ForbiddenException('You cannot do this to this account');
    }
    return user;
  }

  /** Only accounts below the caller's rank are listed. */
  async findAll(actor: CurrentUserInterface, query: ListUsersQueryDto) {
    const showDeleted =
      !!query.deleted && (actor.role === Role.ADMIN || actor.role === Role.SUPERADMIN);
    const filter: QueryFilter<User> = {
      role: { $in: rolesBelow(actor.role) },
      deletedAt: showDeleted ? { $ne: null } : null,
    };
    if (query.search) {
      const term = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ firstname: term }, { lastname: term }, { email: term }];
    }
    const sortable = ['createdAt', 'firstname', 'lastname', 'email'];
    const sortBy = sortable.includes(query.sortBy) ? query.sortBy : 'createdAt';
    const [users, total] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ [sortBy]: query.sortOrder === 'asc' ? 1 : -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      this.userModel.countDocuments(filter),
    ]);
    return {
      items: await Promise.all(users.map((user) => this.toPublic(user))),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** Opening an account is recorded: it shows contact details. */
  async findOneFor(actor: CurrentUserInterface, id: string) {
    const user = await this.requireAccess(actor, id, canView);
    await this.audit.record(actor.id, 'user.view', { type: 'user', id });
    return this.toPublic(user);
  }

  /** Staff fix someone's profile details. Not the email. */
  async updateOther(
    actor: CurrentUserInterface,
    id: string,
    dto: UpdateOtherProfileDto,
  ) {
    const user = await this.requireAccess(actor, id, canEditProfile);
    const changes = Object.fromEntries(
      Object.entries(dto).filter(([, value]) => value !== undefined),
    );
    user.set(changes);
    await user.save();
    await this.audit.record(actor.id, 'user.update', { type: 'user', id }, {
      fields: Object.keys(changes),
    });
    return {
      message: 'Profile updated successfully',
      user: await this.toPublic(user),
    };
  }

  /** Only accounts below the caller, and only to a role the caller may hand out. */
  async changeRole(actor: CurrentUserInterface, id: string, role: Role) {
    const user = await this.requireAccess(actor, id, (a, t) => canAssign(a, t, role));
    if (user.role !== role) {
      const from = user.role;
      user.role = role;
      await user.save();
      await this.audit.record(actor.id, 'user.role_change', { type: 'user', id }, {
        from,
        to: role,
      });
    }
    return { message: 'Role updated', user: await this.toPublic(user) };
  }

  async deactivate(actor: CurrentUserInterface, id: string, reason: string) {
    if (id === actor.id) {
      throw new BadRequestException('You cannot deactivate your own account');
    }
    const user = await this.requireAccess(actor, id, canGovern);
    if (user.deletedAt) {
      throw new BadRequestException('This account is deleted. Restore it instead.');
    }
    if (!user.deactivatedAt) {
      // Signs the person out everywhere. Their access token stops working at
      // once too, because every request checks the account in the database.
      await this.userModel.updateOne(
        { _id: user._id },
        { $set: { deactivatedAt: new Date(), isActive: false, sessions: [] } },
      );
      await this.audit.record(actor.id, 'user.deactivate', { type: 'user', id }, { reason });
      await this.notificationsService.notifyUser(
        user._id,
        NotificationType.ACCOUNT_DEACTIVATED,
        'Account deactivated',
        'Your account has been deactivated. Contact support if you believe this is a mistake.',
      );
    }
    return { message: 'User account deactivated successfully' };
  }

  async activate(actor: CurrentUserInterface, id: string, reason?: string) {
    const user = await this.requireAccess(actor, id, canGovern);
    if (user.deletedAt) {
      throw new BadRequestException('This account is deleted. Restore it instead.');
    }
    if (user.deactivatedAt) {
      await this.userModel.updateOne(
        { _id: user._id },
        { $set: { deactivatedAt: null, isActive: true } },
      );
      await this.audit.record(actor.id, 'user.activate', { type: 'user', id }, { reason: reason ?? null });
    }
    return { message: 'User account activated successfully' };
  }

  /**
   * "Delete" by staff is soft: the account cannot sign in and leaves the
   * list, but the account, its orders and its payments stay, so a mistake can
   * be undone with restore.
   */
  async softDelete(actor: CurrentUserInterface, id: string, reason: string) {
    if (id === actor.id) {
      throw new BadRequestException('You cannot delete your own account here');
    }
    const user = await this.requireAccess(actor, id, canGovern);
    if (!user.deletedAt) {
      await this.userModel.updateOne(
        { _id: user._id },
        { $set: { deletedAt: new Date(), isActive: false, sessions: [] } },
      );
      await this.audit.record(actor.id, 'user.delete', { type: 'user', id }, { reason });
    }
    return { message: 'User account deleted. It can be restored.' };
  }

  async restore(actor: CurrentUserInterface, id: string, reason?: string) {
    const user = await this.requireAccess(actor, id, canGovern);
    if (!user.deletedAt) {
      throw new BadRequestException('This account is not deleted');
    }
    await this.userModel.updateOne(
      { _id: user._id },
      { $set: { deletedAt: null, deactivatedAt: null, isActive: true } },
    );
    await this.audit.record(actor.id, 'user.restore', { type: 'user', id }, { reason: reason ?? null });
    return { message: 'User account restored' };
  }

  /** Needs the current password, then signs the account out everywhere. */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userModel.findById(userId).select('+password');
    if (!user) throw new NotFoundException('User not found');
    if (!user.password || !(await bcrypt.compare(dto.currentPassword, user.password))) {
      throw new UnauthorizedException('Current password is wrong');
    }
    user.password = await bcrypt.hash(dto.newPassword, 12);
    user.mustChangePassword = false;
    await user.save();
    await this.userModel.updateOne({ _id: user._id }, { $set: { sessions: [] } });
    return { message: 'Password changed. Please sign in again.' };
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

  /**
   * Staff create an account. A one-time password is generated and emailed to
   * the new user, who must change it before doing anything else.
   *
   * What the creator may hand out depends on their role (see role-policy): the
   * superadmin makes admins and managers, an admin makes managers.
   *
   * The password is not in the response, so the creator never sees it. If mail
   * is not set up: in production the user is not created (there would be no
   * safe way to hand over the password); elsewhere it is returned, so a
   * development setup without a mail server still works.
   */
  async createAdminProfile(
    actor: CurrentUserInterface,
    createAdminProfileDto: CreateAdminProfileDto,
  ) {
    const role = createAdminProfileDto.role;
    if (!ASSIGNABLE[actor.role].includes(role)) {
      throw new ForbiddenException(`You cannot create ${role} accounts`);
    }
    const existingUser = await this.userModel.findOne({
      email: createAdminProfileDto.email,
    });
    if (existingUser) {
      throw new BadRequestException('User already exists');
    }
    const defaultPassword = randomBytes(9).toString('base64url');
    const hashedPassword = await bcrypt.hash(defaultPassword, 12);

    const user = new this.userModel({
      firstname: createAdminProfileDto.firstname,
      lastname: createAdminProfileDto.lastname,
      email: createAdminProfileDto.email,
      password: hashedPassword,
      role,
      isVerified: true,
      // The emailed password is only for the first sign-in.
      mustChangePassword: true,
    });
    await user.save();

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
    if (!emailed && this.config.get('NODE_ENV') === 'production') {
      await this.userModel.deleteOne({ _id: user._id });
      throw new ServiceUnavailableException(
        'The email could not be sent, so the user was not created. Check the mail settings and try again.',
      );
    }

    await this.audit.record(actor.id, 'user.create', { type: 'user', id: user._id.toString() }, { role });

    await this.notificationsService.notifyUser(
      user._id,
      NotificationType.ADMIN_PROFILE_CREATED,
      'Account created',
      `Welcome, ${user.firstname}! Your ${role} account has been created.`,
    );

    await this.notificationsService.notifyAdmins(
      NotificationType.ADMIN_PROFILE_CREATED,
      'New team member added',
      `${user.firstname} ${user.lastname} was added as ${role}.`,
      '/admin/users',
      user._id,
      [Role.ADMIN, Role.SUPERADMIN],
    );

    const created = {
      id: user._id,
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email,
      role: user.role,
    };
    if (emailed) {
      return {
        message: 'User created. The temporary password was emailed to them.',
        user: created,
      };
    }
    return {
      message:
        'User created. Email is not available here, so the temporary password is shown once (never in production).',
      defaultPassword,
      user: created,
    };
  }
}
