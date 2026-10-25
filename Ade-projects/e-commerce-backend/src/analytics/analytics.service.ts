import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';

import { Model, Types } from 'mongoose';
import { OrderStatus } from '../orders/schemas/order.schema';
import { User } from 'src/users/schemas/user.schema';
import { Product } from '../products/schemas/product.schema';
import { ProductVariant } from 'src/Product-Variants/schemas/product-variant.schema';
import { Category } from '../categories/schemas/category.schema';
import { Brand } from '../brands/schemas/brand.schema';
import { Order } from '../orders/schemas/order.schema';
import { Payment, PaymentStatus } from '../payments/schemas/payment.schema';
import { Role } from 'src/common/enums/role.enum';
import * as bcrypt from 'bcryptjs';
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
  ) {}

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
    return {
      summary: {
        user: { adminName },
        revenue,
        totalOrders,
        pendingOrders,
        totalCustomers,
        totalProducts,
      },
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

  async getOrdersDashboard() {
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

    return {
      summary: {
        totalOrders,
        pendingOrders,
        processingOrders,
        shippedOrders,
        deliveredOrders,
        cancelledOrders,
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
}
