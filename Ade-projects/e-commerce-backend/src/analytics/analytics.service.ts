import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';
import {
  OrderStatus,
  PaymentStatus as OrderPaymentStatus,
} from '../orders/schemas/order.schema';
import { User } from 'src/users/schemas/user.schema';
import { Product } from '../products/schemas/product.schema';
import { ProductVariant } from 'src/Product-Variants/schemas/product-variant.schema';
import { Category } from '../categories/schemas/category.schema';
import { Brand } from '../brands/schemas/brand.schema';
import { Order } from '../orders/schemas/order.schema';
import { Payment, PaymentStatus } from '../payments/schemas/payment.schema';
import { Role } from 'src/common/enums/role.enum';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { ConfigService } from '@nestjs/config';
import {
  RefundRequest,
  RefundStatus,
} from '../refunds/schemas/refund-request.schema';
import { ForbiddenException } from '@nestjs/common';
import type { CurrentUserInterface } from '../common/interfaces/current-user.interface';
import { canView, rolesBelow } from '../common/role-policy';
import { BadRequestException } from '@nestjs/common';
import {
  DELETE_ACTIONS,
  evaluateFlags,
  FlagThresholds,
  isOffHours,
  LOOKUP_ACTIONS,
  sumActions,
} from './flags';

export interface Range {
  from: Date;
  to: Date;
}
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(ProductVariant.name)
    private readonly variantModel: Model<ProductVariant>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(Brand.name) private readonly brandModel: Model<Brand>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(RefundRequest.name)
    private readonly refundModel: Model<RefundRequest>,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private daysAgo(days: number) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }

  private num(key: string, fallback: number) {
    const value = Number(this.config.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private async paidSince(from?: Date) {
    const rows = await this.paymentModel.aggregate([
      {
        $match: {
          status: { $in: [PaymentStatus.PAID, PaymentStatus.REFUNDED] },
          ...(from ? { createdAt: { $gte: from } } : {}),
        },
      },
      { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    return { amount: rows[0]?.amount ?? 0, count: rows[0]?.count ?? 0 };
  }

  private async refundedSince(from: Date) {
    const rows = await this.paymentModel.aggregate([
      { $match: { status: PaymentStatus.REFUNDED, refundedAt: { $gte: from } } },
      {
        $group: {
          _id: null,
          amount: { $sum: { $ifNull: ['$refundedAmount', '$amount'] } },
          count: { $sum: 1 },
        },
      },
    ]);
    return { amount: rows[0]?.amount ?? 0, count: rows[0]?.count ?? 0 };
  }

  private async refundQueue() {
    const [complaintsToVerify, awaitingDecision, replacementsToSend] =
      await Promise.all([
        this.refundModel.countDocuments({
          type: 'DEFECT',
          status: RefundStatus.SUBMITTED,
        }),
        this.refundModel.countDocuments({
          $or: [
            { type: 'DEFECT', status: RefundStatus.VERIFIED },
            { type: 'CANCELLATION', status: RefundStatus.SUBMITTED },
          ],
        }),
        this.refundModel.countDocuments({
          status: RefundStatus.REPLACEMENT_APPROVED,
        }),
      ]);
    return { complaintsToVerify, awaitingDecision, replacementsToSend };
  }

  /**
   * The manager's front page: the work in front of them. No money figures.
   * Also shows what this person themselves did in the last 30 days.
   */
  async getManagerDashboard(actor: CurrentUserInterface) {
    const lateHours = this.num('LATE_ORDER_HOURS', 48);
    const lowStock = this.num('LOW_STOCK_THRESHOLD', 10);
    const byStatus = await this.orderModel.aggregate<{ _id: string; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const orders: Record<string, number> = {};
    for (const row of byStatus) orders[row._id] = row.count;

    const [lateOrders, lowStockVariants, outOfStockVariants, refunds, myActivity] =
      await Promise.all([
        this.orderModel.countDocuments({
          status: { $in: [OrderStatus.PENDING, OrderStatus.PROCESSING] },
          paymentStatus: OrderPaymentStatus.PAID,
          createdAt: { $lt: new Date(Date.now() - lateHours * 3600_000) },
        }),
        this.variantModel.countDocuments({ stock: { $gt: 0, $lte: lowStock } }),
        this.variantModel.countDocuments({ stock: 0 }),
        this.refundQueue(),
        this.audit.summaryFor(actor.id, this.daysAgo(30)),
      ]);
    return {
      orders,
      lateOrders: { count: lateOrders, afterHours: lateHours },
      stock: { low: lowStockVariants, out: outOfStockVariants },
      refundWork: {
        complaintsToVerify: refunds.complaintsToVerify,
        replacementsToSend: refunds.replacementsToSend,
      },
      myActivity,
    };
  }

  /** The superadmin's front page: the whole company at a glance. Read only. */
  async getSuperadminDashboard() {
    const since30 = this.daysAgo(30);
    const since7 = this.daysAgo(7);
    const [
      revenueAllTime,
      revenue30,
      refunded30,
      orders,
      customers,
      teamRows,
      deactivated,
      staffWithout2fa,
      refunds,
      recentActions,
      actionCounts7,
    ] = await Promise.all([
      this.paidSince(),
      this.paidSince(since30),
      this.refundedSince(since30),
      this.orderModel.countDocuments(),
      this.userModel.countDocuments({ role: Role.CUSTOMER, deletedAt: null }),
      this.userModel.aggregate<{ _id: string; count: number }>([
        { $match: { role: { $ne: Role.CUSTOMER }, deletedAt: null } },
        { $group: { _id: '$role', count: { $sum: 1 } } },
      ]),
      this.userModel.countDocuments({ deactivatedAt: { $ne: null }, deletedAt: null }),
      this.userModel
        .find({
          role: { $ne: Role.CUSTOMER },
          deletedAt: null,
          deactivatedAt: null,
          twoFactorEnabled: { $ne: true },
        })
        .select('firstname lastname email role')
        .lean(),
      this.refundQueue(),
      this.audit.recent(10),
      this.audit.countsByAction(since7),
    ]);
    const team: Record<string, number> = {};
    for (const row of teamRows) team[row._id] = row.count;
    return {
      money: {
        revenueAllTime: revenueAllTime.amount,
        revenueLast30Days: revenue30.amount,
        refundedLast30Days: refunded30.amount,
        refundCountLast30Days: refunded30.count,
      },
      orders: { total: orders },
      customers: { total: customers },
      team: { byRole: team, deactivated, staffWithout2fa },
      refundQueue: refunds,
      activity: { last7DaysByAction: actionCounts7, recent: recentActions },
    };
  }

  /**
   * A customer's dashboard, as seen by staff. Opening it is recorded.
   * Managers see orders only; admins and the superadmin also see spending.
   */
  async getCustomerDashboardFor(actor: CurrentUserInterface, customerId: string) {
    const customer = Types.ObjectId.isValid(customerId)
      ? await this.userModel.findById(customerId)
      : null;
    if (!customer) throw new NotFoundException('Customer not found.');
    if (customer.role !== Role.CUSTOMER) {
      throw new NotFoundException('Customer not found.');
    }
    if (!canView(actor.role, customer.role)) {
      throw new ForbiddenException('You cannot view this account');
    }
    const dashboard = await this.getCustomerDashboard(customerId);
    await this.audit.record(actor.id, 'customer.dashboard_view', {
      type: 'user',
      id: customerId,
    });
    if (actor.role === Role.MANAGER) {
      return {
        summary: { orders: dashboard.summary.orders },
        recentOrders: (dashboard.recentOrders as unknown as Record<string, unknown>[]).map(
          (order) => ({
            _id: order._id,
            status: order.status,
            createdAt: order.createdAt,
          }),
        ),
      };
    }
    return dashboard;
  }

  private objectId(id: string): Types.ObjectId {
    return new Types.ObjectId(id);
  }
  async getAdminDashboard(userId: string) {
    let admin = await this.userModel.findById(userId);
    if (!admin) throw new NotFoundException('Admin not found.');
    let adminName = admin.firstname + ' ' + admin.lastname;
    const [
      totalCustomers,
      totalProducts,
      totalOrders,
      pendingOrders,
      totalRevenue,
    ] = await Promise.all([
      this.userModel.countDocuments({ role: Role.CUSTOMER }),
      this.productModel.countDocuments({ isActive: true }),
      this.orderModel.countDocuments(),
      this.orderModel.countDocuments({ status: OrderStatus.PENDING }),
      this.paymentModel.aggregate([
        {
          $match: { status: PaymentStatus.PAID },
        },
        {
          $group: { _id: null, revenue: { $sum: '$amount' } },
        },
      ]),
    ]);
    const revenue = totalRevenue[0]?.revenue ?? 0;
    // BUG FIX: was populate('user', 'firstName lastName email') — camelCase,
    // but the User schema's fields are lowercase firstname/lastname. That
    // mismatch meant every dashboard using this populate returned a blank
    // name (only _id and email actually matched and came through).
    const recentOrders = await this.orderModel
      .find()
      .populate('user', 'firstname lastname email')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('user total status paymentStatus createdAt')
      .lean();
    const since30 = this.daysAgo(30);
    const [revenue30, refunded30, refundQueue, transfersAwaiting] =
      await Promise.all([
        this.paidSince(since30),
        this.refundedSince(since30),
        this.refundQueue(),
        this.paymentModel.countDocuments({
          status: PaymentStatus.AWAITING_CONFIRMATION,
        }),
      ]);
    return {
      summary: {
        user: { adminName },
        revenue,
        totalOrders,
        pendingOrders,
        totalCustomers,
        totalProducts,
      },
      money: {
        revenueLast30Days: revenue30.amount,
        refundedLast30Days: refunded30.amount,
        bankTransfersAwaitingReview: transfersAwaiting,
      },
      refundsAwaitingDecision: refundQueue.awaitingDecision,
      recentOrders,
    };
  }

  async getCustomerDashboard(userId: string) {
    let customer = await this.userModel.findById(userId);
    // BUG FIX: was `throw new Error(...)` — a generic Error isn't
    // caught by Nest's exception filters as a clean HTTP response,
    // so a missing user here would have surfaced as an unhandled
    // 500 instead of a proper 404.
    if (!customer) throw new NotFoundException('Customer not found.');
    let customerName = customer.firstname + ' ' + customer.lastname;
    const [totalOrders, pendingOrders, deliveredOrders, cancelledOrders] =
      await Promise.all([
        this.orderModel.countDocuments({ user: this.objectId(userId) }),
        this.orderModel.countDocuments({
          user: this.objectId(userId),
          status: OrderStatus.PENDING,
        }),
        this.orderModel.countDocuments({
          user: this.objectId(userId),
          status: OrderStatus.DELIVERED,
        }),
        this.orderModel.countDocuments({
          user: this.objectId(userId),
          status: OrderStatus.CANCELLED,
        }),
      ]);

    const spending = await this.paymentModel.aggregate([
      {
        $match: {
          user: this.objectId(userId),
          status: PaymentStatus.PAID,
        },
      },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: '$amount' },
          averagePayment: { $avg: '$amount' },
          totalPayments: { $sum: 1 },
        },
      },
    ]);
    const recentOrders = await this.orderModel
      .find({ user: this.objectId(userId) })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('total status paymentStatus createdAt')
      .lean();
    const paymentSummary = spending[0];
    return {
      summary: {
        orders: {
          totalOrders,
          pendingOrders,
          deliveredOrders,
          cancelledOrders,
        },
        payments: {
          user: { customerName },
          totalSpent: paymentSummary?.totalSpent ?? 0,
          averagePayment: paymentSummary?.averagePayment ?? 0,
          totalPayments: paymentSummary?.totalPayments ?? 0,
        },
      },
      recentOrders,
    };
  }

  async getOrdersDashboard(actor?: CurrentUserInterface) {
    const [
      totalOrders,
      pendingOrders,
      processingOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
    ] = await Promise.all([
      this.orderModel.countDocuments(),
      this.orderModel.countDocuments({
        status: OrderStatus.PENDING,
      }),
      this.orderModel.countDocuments({
        status: OrderStatus.PROCESSING,
      }),
      this.orderModel.countDocuments({
        status: OrderStatus.SHIPPED,
      }),
      this.orderModel.countDocuments({
        status: OrderStatus.DELIVERED,
      }),
      this.orderModel.countDocuments({
        status: OrderStatus.CANCELLED,
      }),
    ]);

    const summary = await this.orderModel.aggregate([
      {
        $group: {
          _id: null,
          totalSales: {
            $sum: '$total',
          },
          averageOrderValue: {
            $avg: '$total',
          },
        },
      },
    ]);

    const recentOrders = await this.orderModel
      .find()
      .populate('user', 'firstname lastname email')
      .sort({
        createdAt: -1,
      })
      .limit(10)
      .select('user total status paymentStatus createdAt')
      .lean();

    const sales = summary[0];
    const counts = {
      totalOrders,
      pendingOrders,
      processingOrders,
      shippedOrders,
      deliveredOrders,
      cancelledOrders,
    };
    // Sales figures are money, and money is for admins and the superadmin.
    if (actor?.role === Role.MANAGER) {
      return {
        summary: counts,
        recentOrders: (recentOrders as unknown as Record<string, unknown>[]).map(
          (order) => {
            const { total: _total, ...rest } = order;
            return rest;
          },
        ),
      };
    }
    return {
      summary: {
        ...counts,
        totalSales: sales?.totalSales ?? 0,
        averageOrderValue: sales?.averageOrderValue ?? 0,
      },
      recentOrders,
    };
  }

  async getAddProductDashboard() {
    const [totalCategories, totalBrands, totalProducts, totalVariants] =
      await Promise.all([
        this.categoryModel.countDocuments(),
        this.brandModel.countDocuments(),
        this.productModel.countDocuments({
          isActive: true,
        }),
        this.variantModel.countDocuments({
          isActive: true,
        }),
      ]);

    return {
      summary: {
        totalCategories,
        totalBrands,
        totalProducts,
        totalVariants,
      },
    };
  }

  async getProductListDashboard() {
    const [
      totalProducts,
      activeProducts,
      inactiveProducts,
      totalVariants,
      lowStock,
      outOfStock,
    ] = await Promise.all([
      this.productModel.countDocuments(),

      this.productModel.countDocuments({
        isActive: true,
      }),

      this.productModel.countDocuments({
        isActive: false,
      }),

      this.variantModel.countDocuments(),

      this.variantModel.countDocuments({
        stock: {
          $gt: 0,
          $lte: 10,
        },
      }),

      this.variantModel.countDocuments({
        stock: 0,
      }),
    ]);

    const lowStockProducts = await this.variantModel
      .find({
        stock: {
          $gt: 0,
          $lte: 10,
        },
      })
      .populate({
        path: 'product',
        select: 'name sku',
      })
      .sort({
        stock: 1,
      })
      .limit(10)
      .lean();

    return {
      summary: {
        totalProducts,
        activeProducts,
        inactiveProducts,
        totalVariants,
        lowStock,
        outOfStock,
      },
      lowStockProducts,
    };
  }

  async getTransactionsDashboard() {
    const [
      totalTransactions,
      successfulTransactions,
      pendingTransactions,
      failedTransactions,
      refundedTransactions,
    ] = await Promise.all([
      this.paymentModel.countDocuments(),

      this.paymentModel.countDocuments({
        status: PaymentStatus.PAID,
      }),

      this.paymentModel.countDocuments({
        status: PaymentStatus.PENDING,
      }),

      this.paymentModel.countDocuments({
        status: PaymentStatus.FAILED,
      }),

      this.paymentModel.countDocuments({
        status: PaymentStatus.REFUNDED,
      }),
    ]);

    const paymentSummary = await this.paymentModel.aggregate([
      {
        $match: {
          status: PaymentStatus.PAID,
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: {
            $sum: '$amount',
          },
          averageAmount: {
            $avg: '$amount',
          },
        },
      },
    ]);

    const recentTransactions = await this.paymentModel
      .find()
      .populate('user', 'firstname lastname email')
      .populate('order', '_id total')
      .sort({
        createdAt: -1,
      })
      .limit(10)
      .select(
        'amount currency provider status transactionReference createdAt user order',
      )
      .lean();

    const summary = paymentSummary[0];

    return {
      summary: {
        totalTransactions,
        successfulTransactions,
        pendingTransactions,
        failedTransactions,
        refundedTransactions,
        totalAmount: summary?.totalAmount ?? 0,
        averageAmount: summary?.averageAmount ?? 0,
      },
      recentTransactions,
    };
  }

  async getUserProfile(userId: string) {
    const user = await this.userModel.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      firstName: user.firstname,
      lastName: user.lastname,
      dateOfBirth: user.dateOfBirth,
      gender: user.gender,
      address: user.address,
      email: user.email,
      phoneNumber: user.phoneNumber,
    };
  }

  // ---- Staff activity, sales over time and the weekly summary ----

  thresholds(): FlagThresholds {
    return {
      deletes: this.num('FLAG_DELETES', 10),
      lookups: this.num('FLAG_LOOKUPS', 20),
      offHoursStart: this.num('OFF_HOURS_START', 22),
      offHoursEnd: this.num('OFF_HOURS_END', 6),
      tzOffsetHours: this.num('REPORT_TZ_OFFSET_HOURS', 1),
    };
  }

  /** `from` and `to` default to the last 30 days. A period is at most a year. */
  range(from?: string, to?: string): Range {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (start > end) throw new BadRequestException('"from" must be before "to"');
    if (end.getTime() - start.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('A report can cover at most one year');
    }
    return { from: start, to: end };
  }

  /** Staff the caller may see: admins see managers, the superadmin sees admins and managers, everyone sees themselves. */
  private async staffFor(actor: CurrentUserInterface) {
    const below = rolesBelow(actor.role as Role).filter((role) => role !== Role.CUSTOMER);
    return this.userModel
      .find({
        $or: [
          { _id: new Types.ObjectId(actor.id) },
          ...(below.length ? [{ role: { $in: below }, deletedAt: null }] : []),
        ],
      })
      .select('firstname lastname email role isActive twoFactorEnabled')
      .sort({ role: 1, firstname: 1 })
      .lean();
  }

  async staffActivity(actor: CurrentUserInterface, { from, to }: Range, record = true) {
    const staff = await this.staffFor(actor);
    const thresholds = this.thresholds();
    const entries = await this.audit.between(from, to, staff.map((s) => String(s._id)));
    const rows = staff.map((person) => {
      const mine = entries.filter((e) => String(e.actorId) === String(person._id));
      const counts: Record<string, number> = {};
      let offHours = 0;
      let lastActionAt: Date | null = null;
      for (const entry of mine) {
        counts[entry.action] = (counts[entry.action] ?? 0) + 1;
        if (isOffHours(entry.createdAt, thresholds)) offHours += 1;
        lastActionAt = entry.createdAt;
      }
      const twoFactorEnabled = Boolean(person.twoFactorEnabled);
      return {
        id: String(person._id),
        name: `${person.firstname} ${person.lastname}`,
        email: person.email,
        role: person.role,
        isActive: person.isActive,
        twoFactorEnabled,
        totalActions: mine.length,
        lastActionAt,
        deletes: sumActions(counts, DELETE_ACTIONS),
        lookups: sumActions(counts, LOOKUP_ACTIONS),
        offHoursActions: offHours,
        actions: counts,
        flags: evaluateFlags({ counts, offHoursActions: offHours, twoFactorEnabled, thresholds }),
      };
    });
    if (record) await this.audit.record(actor.id, 'report.view', undefined, { report: 'staff-activity' });
    return { from, to, thresholds, staff: rows };
  }

  /** Orders, paid money (naira), refunds and new customers in a period, with a row per day. */
  async sales({ from, to }: Range) {
    const day = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    const [orders, paid, refunded, newCustomers] = await Promise.all([
      this.orderModel.aggregate<{ _id: string; count: number }>([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: day, count: { $sum: 1 } } },
      ]),
      this.paymentModel.aggregate<{ _id: string; count: number; amount: number }>([
        {
          $match: {
            status: { $in: [PaymentStatus.PAID, PaymentStatus.REFUNDED] },
            createdAt: { $gte: from, $lte: to },
          },
        },
        { $group: { _id: day, count: { $sum: 1 }, amount: { $sum: '$amount' } } },
      ]),
      this.paymentModel.aggregate<{ _id: null; count: number; amount: number }>([
        { $match: { status: PaymentStatus.REFUNDED, refundedAt: { $gte: from, $lte: to } } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            amount: { $sum: { $ifNull: ['$refundedAmount', '$amount'] } },
          },
        },
      ]),
      this.userModel.countDocuments({ role: Role.CUSTOMER, createdAt: { $gte: from, $lte: to } }),
    ]);
    const days = new Map<string, { day: string; orders: number; payments: number; revenue: number }>();
    const entry = (key: string) => {
      const found = days.get(key) ?? { day: key, orders: 0, payments: 0, revenue: 0 };
      days.set(key, found);
      return found;
    };
    for (const row of orders) entry(row._id).orders = row.count;
    for (const row of paid) {
      entry(row._id).payments = row.count;
      entry(row._id).revenue = row.amount;
    }
    return {
      from,
      to,
      totals: {
        orders: orders.reduce((t, r) => t + r.count, 0),
        payments: paid.reduce((t, r) => t + r.count, 0),
        revenue: paid.reduce((t, r) => t + r.amount, 0),
        refunds: refunded[0]?.count ?? 0,
        refundedAmount: refunded[0]?.amount ?? 0,
        newCustomers,
      },
      byDay: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    };
  }
}
