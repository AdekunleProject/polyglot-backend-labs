import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Connection, Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';

import {
  Payment,
  PaymentStatus,
  PaymentProvider,
} from './schemas/payment.schema';
import { Order } from '../orders/schemas/order.schema';

import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { PayStackService } from './paystack.service';
import * as crypto from 'crypto';
import { UsersService } from 'src/users/user.service';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { InitializeBankTransferDto } from './dto/initialize-bank-transfer.dto';
import { ConfirmBankTransferDto } from './dto/confirm-bank-transfer.dto';
import { FileUpload } from 'src/aws/aws.file-upload';
import { NotificationsService } from 'src/notifications/notification.service';
import { NotificationType } from 'src/notifications/schemas/notification.schema';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(Order.name) private readonly orderService: Model<Order>,
    // private readonly userSerivce: Model<UserDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    private readonly paystackService: PayStackService,
    private readonly configService: ConfigService,
    private readonly userService: UsersService,
    private readonly fileUpload: FileUpload,
    private readonly notificationsService: NotificationsService,
  ) {}

  async initializePayment(userId: string, dto: InitializePaymentDto) {
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const order = await this.orderService
        .findOne({ _id: dto.orderId, user: new Types.ObjectId(userId) })
        .session(session);

      if (!order) {
        throw new NotFoundException('Order not response.data found.');
      }
      const existingPayment = await this.paymentModel
        .findOne({
          order: order._id,
          status: {
            $in: [PaymentStatus.PENDING, PaymentStatus.PAID],
          },
        })
        .session(session);

      if (existingPayment) {
        throw new BadRequestException(
          'A payment has already been initialized for this order.',
        );
      }

      const user = await this.userService.findById(userId);

      if (!user) {
        throw new NotFoundException('User not found.');
      }

      const reference = `PAY-${randomUUID()}`;

      const payment = await this.paymentModel.create(
        [
          {
            order: order._id,
            user: user._id,
            amount: order.total,
            currency: 'NGN',
            provider: PaymentProvider.PAYSTACK,
            status: PaymentStatus.PENDING,
            transactionReference: reference,
          },
        ],
        { session },
      );
      const paystackResponse = await this.paystackService.initializeTransaction(
        {
          email: user.email,
          amount: order.total * 100,
          reference,
          callback_url:
            dto.callbackUrl ??
            this.configService.getOrThrow<string>('PAYSTACK_CALLBACK_URL'),
          metadata: {
            orderId: order._id.toString(),
            paymentId: payment[0]._id.toString(),
          },
        },
      );
      await session.commitTransaction();

      return {
        authorizationUrl: paystackResponse.data.authorization_url,
        accessCode: paystackResponse.data.access_code,
        reference,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async findMyPayment(paymentId: string, userId: string) {
    const payment = await this.paymentModel
      .findOne({
        _id: paymentId,
        user: new Types.ObjectId(userId),
      })
      .populate('user')
      .populate('order');

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    return payment;
  }

  async findPayment(paymentId: string) {
    const payment = await this.paymentModel
      .findById(paymentId)
      .populate('user')
      .populate('order');

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    return payment;
  }

  async verifyPayment(reference: string) {
    const payment = await this.paymentModel.findOne({
      transactionReference: reference,
    });

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    if (payment.status === PaymentStatus.PAID) {
      return {
        success: true,
        message: 'Payment already verified.',
      };
    }
    const response = await this.paystackService.verifyTransaction(reference);
    const transaction = response.data;
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const paymentInSession = await this.paymentModel
        .findById(payment._id)
        .session(session);

      if (!paymentInSession) {
        throw new NotFoundException('Payment not found.');
      }
      if (transaction.status !== 'success') {
        paymentInSession.status = PaymentStatus.FAILED;
        paymentInSession.gatewayResponse = transaction;

        await paymentInSession.save({ session });

        await session.commitTransaction();

        return {
          success: false,
          message: 'Payment failed.',
        };
      }
      paymentInSession.status = PaymentStatus.PAID;
      paymentInSession.gatewayTransactionId = transaction.id?.toString();
      paymentInSession.paymentMethod = transaction.channel;
      paymentInSession.paidAt = new Date(transaction.paid_at);
      paymentInSession.gatewayResponse = transaction;

      await paymentInSession.save({ session });

      await this.orderService.updateOne(
        { _id: paymentInSession.order },
        {
          $set: {
            paymentStatus: PaymentStatus.PAID,
          },
        },
        { session },
      );

      await session.commitTransaction();

      await this.notificationsService.notifyUser(
        paymentInSession.user.toString(),
        NotificationType.PAYMENT_RECEIVED,
        'Payment received',
        `Your payment of ${paymentInSession.currency} ${paymentInSession.amount.toFixed(2)} was received.`,
        `/orders/${paymentInSession.order}`,
      );

      return {
        success: true,
        message: 'Payment verified successfully.',
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async verifyAllPayments() {
    return this.paymentModel
      .find()
      .populate('user')
      .populate('order')
      .sort({ createdAt: -1 });
  }

  async handleWebhook(signature: string, payload: any) {
    const hash = crypto
      .createHmac(
        'sha512',
        this.configService.get<string>('PAYSTACK_SECRET_KEY')!,
      )
      .update(JSON.stringify(payload))
      .digest('hex');

    if (hash !== signature) {
      throw new BadRequestException('Invalid webhook signature.');
    }
    if (payload.event !== 'charge.success') {
      return {
        received: true,
      };
    }
    await this.verifyPayment(payload.data.reference);
    return {
      received: true,
    };
  }
  async getMyPayments(userId: string) {
    return this.paymentModel
      .find({
        user: new Types.ObjectId(userId),
      })
      .populate('order')
      .sort({
        createdAt: -1,
      });
  }

  async refundPayment(dto: RefundPaymentDto) {
    const payment = await this.paymentModel.findById(dto.paymentId);

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    if (payment.status === PaymentStatus.REFUNDED) {
      throw new BadRequestException('Payment has already been refunded.');
    }

    if (payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException(
        'Only successful payments can be refunded.',
      );
    }

    if (!payment.gatewayTransactionId) {
      throw new BadRequestException('Gateway transaction ID not found.');
    }

    const paystackRefund = await this.paystackService.refundTransaction(
      payment.gatewayTransactionId,
      dto.amount,
    );

    const session = await this.connection.startSession();

    try {
      session.startTransaction();

      payment.status = PaymentStatus.REFUNDED;
      payment.refundedAt = new Date();
      payment.gatewayResponse = paystackRefund;

      await payment.save({ session });

      await this.orderService.updateOne(
        {
          _id: payment.order,
        },
        {
          $set: {
            paymentStatus: PaymentStatus.REFUNDED,
          },
        },
        {
          session,
        },
      );

      await session.commitTransaction();

      await this.notificationsService.notifyUser(
        payment.user.toString(),
        NotificationType.PAYMENT_REFUNDED,
        'Payment refunded',
        `Your payment of ${payment.currency} ${payment.amount.toFixed(2)} has been refunded.`,
        `/orders/${payment.order}`,
      );

      return {
        success: true,
        message: 'Payment refunded successfully.',
        data: paystackRefund.data,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async initializeBankTransfer(userId: string, dto: InitializeBankTransferDto) {
    const order = await this.orderService.findOne({
      _id: dto.orderId,
      user: new Types.ObjectId(userId),
    });

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    const existingPayment = await this.paymentModel.findOne({
      order: order._id,
      status: {
        $in: [
          PaymentStatus.PENDING,
          PaymentStatus.AWAITING_CONFIRMATION,
          PaymentStatus.PAID,
        ],
      },
    });

    if (existingPayment) {
      throw new BadRequestException('Payment already exists for this order.');
    }

    const reference = `BANK-${randomUUID()}`;

    const payment = await this.paymentModel.create({
      order: order._id,
      user: order.user,
      amount: order.total,
      currency: 'NGN',
      provider: PaymentProvider.BANK_TRANSFER,
      status: PaymentStatus.PENDING,
      transactionReference: reference,

      bankName: this.configService.get<string>('BANK_NAME'),
      accountName: this.configService.get<string>('BANK_ACCOUNT_NAME'),
      accountNumber: this.configService.get<string>('BANK_ACCOUNT_NUMBER'),
    });

    return {
      paymentId: payment._id,
      reference,
      amount: payment.amount,
      bankName: payment.bankName,
      accountName: payment.accountName,
      accountNumber: payment.accountNumber,
    };
  }

  async confirmBankTransfer(
    userId: string,
    dto: ConfirmBankTransferDto,
    receipt?: Express.Multer.File,
  ) {
    const payment = await this.paymentModel.findOne({
      _id: dto.paymentId,
      user: new Types.ObjectId(userId),
    });

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }
    if (receipt) {
      payment.receipt = await this.fileUpload.uploadFile(receipt, 'receipts');
    }
    if (payment.provider !== PaymentProvider.BANK_TRANSFER) {
      throw new BadRequestException('Invalid payment method.');
    }
    payment.receiptUrl = dto.receiptUrl;
    payment.status = PaymentStatus.AWAITING_CONFIRMATION;
    await payment.save();

    await this.notificationsService.notifyAdmins(
      NotificationType.TRANSFER_SUBMITTED,
      'Bank transfer awaiting review',
      `A bank transfer of ${payment.currency} ${payment.amount.toFixed(2)} was submitted and needs review.`,
      `/admin/payments`,
    );

    return {
      success: true,
      message: 'Transfer submitted successfully. Awaiting confirmation.',
    };
  }

  async getPendingTransfers() {
    return this.paymentModel
      .find({
        provider: PaymentProvider.BANK_TRANSFER,
        status: PaymentStatus.AWAITING_CONFIRMATION,
      })
      .populate('user', 'firstname lastname email')
      .populate('order')
      .sort({ createdAt: -1 });
  }

  async approveTransfer(paymentId: string, userId: string) {
    const payment = await this.paymentModel.findById(paymentId);

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    payment.status = PaymentStatus.PAID;

    payment.confirmedAt = new Date();

    payment.confirmedBy = new Types.ObjectId(userId);

    payment.paidAt = new Date();

    await payment.save();

    await this.orderService.updateOne(
      {
        _id: payment.order,
      },
      {
        $set: {
          paymentStatus: PaymentStatus.PAID,
          paidAt: payment.paidAt,
        },
      },
    );

    await this.notificationsService.notifyUser(
      payment.user.toString(),
      NotificationType.PAYMENT_RECEIVED,
      'Payment confirmed',
      `Your bank transfer of ${payment.currency} ${payment.amount.toFixed(2)} has been confirmed.`,
      `/orders/${payment.order}`,
    );

    return {
      success: true,
      message: 'Payment approved.',
    };
  }

  async rejectTransfer(paymentId: string) {
    const payment = await this.paymentModel.findById(paymentId);

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    payment.status = PaymentStatus.FAILED;

    await payment.save();

    await this.notificationsService.notifyUser(
      payment.user.toString(),
      NotificationType.TRANSFER_REJECTED,
      'Bank transfer rejected',
      `Your bank transfer of ${payment.currency} ${payment.amount.toFixed(2)} could not be confirmed. Please contact support or try again.`,
      `/orders/${payment.order}`,
    );

    return {
      success: true,
      message: 'Transfer rejected.',
    };
  }
}
