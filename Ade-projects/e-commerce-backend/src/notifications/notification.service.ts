import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { Notification, NotificationType } from './schemas/notification.schema';
import { User } from '../users/schemas/user.schema';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<Notification>,
    @InjectModel(User.name)
    private readonly userModel: Model<User>,
  ) {}

  // Called from other modules (orders, payments) to fire a single-user
  // notification — not exposed via any controller route itself.
  async notifyUser(
    recipientId: string | Types.ObjectId,
    type: NotificationType,
    title: string,
    message: string,
    link?: string,
  ) {
    return this.notificationModel.create({
      recipient: recipientId,
      type,
      title,
      message,
      link,
    });
  }

  // Fans a notification out to every admin — used for events admins need
  // to see (new orders, bank transfers awaiting review, low stock), not
  // any one specific admin. excludeUserId skips one admin — used when the
  // event is itself about that admin (e.g. "a new admin was created")
  // and they're getting their own, different notification instead.
  async notifyAdmins(
    type: NotificationType,
    title: string,
    message: string,
    link?: string,
    excludeUserId?: string | Types.ObjectId,
  ) {
    // Matches the same role query pattern already used in
    // AnalyticsService/UsersService elsewhere in this codebase — the
    // User schema types `role` as an ObjectId ref despite storing a plain
    // Role enum string, so this follows the existing working convention
    // rather than "fixing" that mismatch here.
    const filter: Record<string, unknown> = { role: Role.ADMIN };
    if (excludeUserId) filter._id = { $ne: excludeUserId };
    const admins = await this.userModel.find(filter).select('_id');
    if (!admins.length) return [];
    return this.notificationModel.insertMany(
      admins.map((admin) => ({
        recipient: admin._id,
        type,
        title,
        message,
        link,
      })),
    );
  }

  async findMine(userId: string, unreadOnly = false) {
    const filter: Record<string, unknown> = { recipient: userId };
    if (unreadOnly) filter.isRead = false;
    return this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationModel.countDocuments({
      recipient: userId,
      isRead: false,
    });
    return { count };
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, recipient: userId },
      { isRead: true },
      { new: true },
    );
    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }
    return notification;
  }

  async markAllAsRead(userId: string) {
    await this.notificationModel.updateMany(
      { recipient: userId, isRead: false },
      { isRead: true },
    );
    return { message: 'All notifications marked as read.' };
  }
}
