import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { AuditService } from 'src/audit/audit.service';
import { FileUpload } from 'src/aws/aws.file-upload';
import { Role } from 'src/common/enums/role.enum';
import type { CurrentUserInterface } from 'src/common/interfaces/current-user.interface';
import { NotificationsService } from 'src/notifications/notification.service';
import { NotificationType } from 'src/notifications/schemas/notification.schema';
import { OrdersService } from 'src/orders/order.service';
import { Order, OrderStatus } from 'src/orders/schemas/order.schema';
import { PaymentsService } from 'src/payments/payment.service';
import { Payment, PaymentStatus } from 'src/payments/schemas/payment.schema';
import { CreateRefundRequestDto } from './dto/create-refund-request.dto';
import { ListRefundsQueryDto } from './dto/list-refunds-query.dto';
import { ReviewDto } from './dto/review.dto';
import {
  allowedResolutions,
  refundAmountMinor,
  RefundPolicyConfig,
} from './refund-policy';
import { RefundRequest, RefundStatus } from './schemas/refund-request.schema';

const OPEN: RefundStatus[] = [
  RefundStatus.SUBMITTED,
  RefundStatus.VERIFIED,
  RefundStatus.REFUNDED,
  RefundStatus.REPLACEMENT_APPROVED,
  RefundStatus.REPLACEMENT_SENT,
];

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    @InjectModel(RefundRequest.name)
    private readonly requests: Model<RefundRequest>,
    @InjectModel(Order.name) private readonly orders: Model<Order>,
    @InjectModel(Payment.name) private readonly payments: Model<Payment>,
    private readonly paymentsService: PaymentsService,
    private readonly ordersService: OrdersService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly fileUpload: FileUpload,
    private readonly config: ConfigService,
  ) {}

  private policy(): RefundPolicyConfig {
    const num = (key: string, fallback: number) => {
      const value = Number(this.config.get(key));
      return Number.isFinite(value) && value > 0 ? value : fallback;
    };
    return {
      refundHours: num('REFUND_CLAIM_HOURS', 24),
      replacementHours: num('REPLACEMENT_CLAIM_HOURS', 72),
      cancellationPercent: num('CANCELLATION_REFUND_PERCENT', 65),
    };
  }

  /** A customer asks for a refund or replacement. The rules are checked here, not by the client. */
  async create(
    userId: string,
    dto: CreateRefundRequestDto,
    files: Express.Multer.File[] = [],
  ) {
    const order = await this.orders.findOne({
      _id: dto.orderId,
      user: new Types.ObjectId(userId),
    });
    if (!order) throw new NotFoundException('Order not found');

    const payment = await this.payments.findOne({
      order: order._id,
      status: PaymentStatus.PAID,
    });
    if (!payment) {
      throw new BadRequestException('This order has no confirmed payment to refund');
    }

    const existing = await this.requests.findOne({
      order: order._id,
      status: { $in: OPEN },
    });
    if (existing) {
      throw new ConflictException('This order already has a refund request');
    }

    const policy = this.policy();
    let resolution = dto.resolution;
    let deliveredAt: Date | null = null;

    if (dto.type === 'DEFECT') {
      if (order.status !== OrderStatus.DELIVERED || !order.deliveredAt) {
        throw new BadRequestException(
          'A damaged or faulty item can only be reported after the order is delivered',
        );
      }
      if (!resolution) {
        throw new BadRequestException('Choose a refund or a replacement');
      }
      if (files.length === 0) {
        throw new BadRequestException(
          'Please attach clear photos or a video showing the problem',
        );
      }
      deliveredAt = order.deliveredAt;
      const allowed = allowedResolutions(deliveredAt, new Date(), policy);
      if (allowed.length === 0) {
        throw new BadRequestException(
          `The ${policy.replacementHours}-hour window for complaints has passed`,
        );
      }
      if (!allowed.includes(resolution)) {
        throw new BadRequestException(
          `More than ${policy.refundHours} hours have passed since delivery, so only a replacement can be requested`,
        );
      }
    } else {
      const notArrived = [
        OrderStatus.PENDING,
        OrderStatus.PROCESSING,
        OrderStatus.SHIPPED,
      ];
      if (!notArrived.includes(order.status)) {
        throw new BadRequestException(
          'Only an order that has not arrived can be cancelled for a refund',
        );
      }
      resolution = 'REFUND';
    }

    const evidence: string[] = [];
    for (const file of files) {
      evidence.push(await this.fileUpload.uploadFile(file, 'refund-evidence'));
    }

    const request = await this.requests.create({
      order: order._id,
      payment: payment._id,
      user: new Types.ObjectId(userId),
      type: dto.type,
      resolution,
      reason: dto.reason,
      evidence,
      deliveredAt,
      amountMinor: refundAmountMinor(dto.type, payment.amount, policy),
    });

    await this.audit.record(
      userId,
      'refund.request',
      { type: 'refund', id: request._id.toString() },
      { type: dto.type, resolution, orderId: dto.orderId },
    );
    await this.notifications.notifyAdmins(
      NotificationType.REFUND_REQUESTED,
      dto.type === 'DEFECT' ? 'New complaint to verify' : 'New cancellation refund request',
      dto.type === 'DEFECT'
        ? 'A customer reported a damaged, faulty or wrong item.'
        : 'A customer cancelled an order that has not arrived.',
      `/admin/refunds/${request._id}`,
      undefined,
      dto.type === 'DEFECT' ? [Role.MANAGER, Role.ADMIN] : [Role.ADMIN],
    );

    return this.present(request, false);
  }

  async mine(userId: string) {
    const items = await this.requests
      .find({ user: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 });
    return Promise.all(items.map((item) => this.present(item, false)));
  }

  async list(query: ListRefundsQueryDto) {
    const filter: FilterQuery<RefundRequest> = {};
    if (query.status) filter.status = query.status;
    const [items, total] = await Promise.all([
      this.requests
        .find(filter)
        .sort({ createdAt: query.sortOrder === 'asc' ? 1 : -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit),
      this.requests.countDocuments(filter),
    ]);
    return {
      items: await Promise.all(items.map((item) => this.present(item, false))),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /** Staff open one request, with links to the evidence. */
  async get(id: string) {
    return this.present(await this.find(id), true);
  }

  /** The manager checks the evidence of a complaint. */
  async verify(actor: CurrentUserInterface, id: string, dto: ReviewDto) {
    const request = await this.requests.findOneAndUpdate(
      { _id: id, type: 'DEFECT', status: RefundStatus.SUBMITTED },
      {
        $set: {
          status: dto.approve ? RefundStatus.VERIFIED : RefundStatus.REJECTED,
          verifiedBy: new Types.ObjectId(actor.id),
          verifiedAt: new Date(),
          verificationNote: dto.note,
        },
      },
      { new: true },
    );
    if (!request) {
      await this.find(id);
      throw new BadRequestException('Only a new complaint can be verified');
    }
    await this.audit.record(
      actor.id,
      'refund.verify',
      { type: 'refund', id },
      { approve: dto.approve, note: dto.note },
    );
    if (dto.approve) {
      await this.notifications.notifyAdmins(
        NotificationType.REFUND_VERIFIED,
        'Complaint verified, waiting for your decision',
        'A manager confirmed the evidence.',
        `/admin/refunds/${id}`,
        undefined,
        [Role.ADMIN],
      );
    } else {
      await this.notifications.notifyUser(
        request.user.toString(),
        NotificationType.REFUND_DECIDED,
        'Complaint not accepted',
        `We could not confirm the problem: ${dto.note}`,
        `/orders/${request.order}`,
      );
    }
    return this.present(request, false);
  }

  /** The admin decides. For a refund this pays the money back. */
  async decide(actor: CurrentUserInterface, id: string, dto: ReviewDto) {
    const awaiting =
      (await this.find(id)).type === 'DEFECT'
        ? RefundStatus.VERIFIED
        : RefundStatus.SUBMITTED;

    // Claim it first so two clicks cannot pay the same refund twice.
    const request = await this.requests.findOneAndUpdate(
      { _id: id, status: awaiting, decidedAt: null },
      {
        $set: {
          decidedBy: new Types.ObjectId(actor.id),
          decidedAt: new Date(),
          decisionNote: dto.note,
        },
      },
      { new: true },
    );
    if (!request) {
      throw new BadRequestException(
        awaiting === RefundStatus.VERIFIED
          ? 'A manager must verify the complaint before it can be decided'
          : 'This request has already been decided',
      );
    }

    const userId = request.user.toString();
    try {
      if (!dto.approve) {
        request.status = RefundStatus.DECLINED;
        await request.save();
        await this.notifications.notifyUser(
          userId,
          NotificationType.REFUND_DECIDED,
          'Request declined',
          `Your request was declined: ${dto.note}`,
          `/orders/${request.order}`,
        );
      } else if (request.resolution === 'REPLACEMENT') {
        request.status = RefundStatus.REPLACEMENT_APPROVED;
        await request.save();
        await this.notifications.notifyUser(
          userId,
          NotificationType.REFUND_DECIDED,
          'Replacement approved',
          'Your replacement has been approved. We will send it to you.',
          `/orders/${request.order}`,
        );
        await this.notifications.notifyAdmins(
          NotificationType.REFUND_DECIDED,
          'Replacement to send',
          'An approved replacement is waiting to be sent.',
          `/admin/refunds/${id}`,
          undefined,
          [Role.MANAGER],
        );
      } else {
        await this.paymentsService.refundPayment({
          paymentId: request.payment.toString(),
          amount: request.amountMinor,
        });
        request.status = RefundStatus.REFUNDED;
        await request.save();
        if (request.type === 'CANCELLATION') {
          await this.ordersService.cancelForRefund(request.order.toString());
        }
      }
    } catch (error) {
      // Nothing was paid out: let the admin try again.
      await this.requests.updateOne(
        { _id: id, status: awaiting },
        { $set: { decidedBy: null, decidedAt: null, decisionNote: null } },
      );
      this.logger.error(
        `Refund ${id} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }

    await this.audit.record(
      actor.id,
      'refund.decide',
      { type: 'refund', id },
      {
        approve: dto.approve,
        resolution: request.resolution,
        amountMinor: request.amountMinor,
        note: dto.note,
      },
    );
    return this.present(request, false);
  }

  /** A manager marks the approved replacement as sent. */
  async markReplacementSent(actor: CurrentUserInterface, id: string) {
    const request = await this.requests.findOneAndUpdate(
      { _id: id, status: RefundStatus.REPLACEMENT_APPROVED },
      { $set: { status: RefundStatus.REPLACEMENT_SENT } },
      { new: true },
    );
    if (!request) {
      await this.find(id);
      throw new BadRequestException('There is no approved replacement to send');
    }
    await this.audit.record(actor.id, 'refund.replacement_sent', {
      type: 'refund',
      id,
    });
    await this.notifications.notifyUser(
      request.user.toString(),
      NotificationType.REPLACEMENT_SENT,
      'Replacement on its way',
      'Your replacement has been sent.',
      `/orders/${request.order}`,
    );
    return this.present(request, false);
  }

  private async find(id: string) {
    const request = Types.ObjectId.isValid(id)
      ? await this.requests.findById(id)
      : null;
    if (!request) throw new NotFoundException('Refund request not found');
    return request;
  }

  private async present(request: RefundRequest, withEvidenceLinks: boolean) {
    let evidence: string[] = [];
    if (withEvidenceLinks) {
      evidence = await Promise.all(
        request.evidence.map((key) =>
          this.fileUpload.getDownloadUrl(key).catch(() => key),
        ),
      );
    }
    return {
      id: request._id,
      order: request.order,
      user: request.user,
      type: request.type,
      resolution: request.resolution,
      reason: request.reason,
      evidenceCount: request.evidence.length,
      evidence,
      amount: request.amountMinor / 100,
      status: request.status,
      verifiedBy: request.verifiedBy,
      verificationNote: request.verificationNote,
      decidedBy: request.decidedBy,
      decisionNote: request.decisionNote,
      createdAt: (request as unknown as { createdAt?: Date }).createdAt,
    };
  }
}
