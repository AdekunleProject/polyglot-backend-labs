import {
  BadRequestException,
  Injectable,
  NotFoundException,
  forwardRef,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  Order,
  PaymentStatus,
  OrderStatus,
  OrderItem,
} from './schemas/order.schema';

import { CartService } from '../cart/cart.service';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { ProductVariant } from 'src/Product-Variants/schemas/product-variant.schema';
import { Product } from 'src/products/schemas/product.schema';
import { VariantsService } from 'src/Product-Variants/product-variant.service';
import { NotificationsService } from 'src/notifications/notification.service';
import { NotificationType } from 'src/notifications/schemas/notification.schema';

// Variants at or below this remaining stock trigger a LOW_STOCK
// notification to admins after an order is placed. Arbitrary but
// reasonable threshold — change here if you want a different cutoff.
const LOW_STOCK_THRESHOLD = 5;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @Inject() private cartService: CartService,
    private readonly variantsService: VariantsService,
    private readonly notificationsService: NotificationsService,
  ) {}
  private async restoreStock(
    reserved: { variantId: string; quantity: number }[],
  ) {
    for (const item of reserved) {
      try {
        await this.variantsService.increaseStock(item.variantId, item.quantity);
      } catch (error) {
        this.logger.error(
          `Could not restore stock for variant ${item.variantId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async create(userId: string, createOrderDto: CreateOrderDto) {
    const cart = await this.cartService.getCartForCheckout(userId);
    if (!createOrderDto.shippingAddress) {
      throw new BadRequestException('Shipping address is required.');
    }
    if (!cart || cart.items.length === 0) {
      throw new BadRequestException('Your cart is empty.');
    }
    const items: OrderItem[] = [];
    let subtotal = 0;
    // BUG FIX: order creation, cart clearing, and the return statement
    // were all previously INSIDE this loop. For any cart with more than
    // one item, the order got created after only the first iteration —
    // with just that one item — then the cart was cleared and the
    // function returned immediately. Every other item in the cart was
    // silently dropped, not just left in the order but lost from the
    // cart too, since clearCart() already ran. Moved everything below
    // the loop so all items are actually collected first.
    const lowStockVariants: { name: string; sku: string; stock: number }[] = [];
    for (const cartItem of cart.items) {
      const variant = cartItem.variant as unknown as ProductVariant;
      if (variant.stock < cartItem.quantity) {
        throw new BadRequestException(`${variant.sku} is out of stock.`);
      }
      const product = variant.product as Product;

      const unitPrice = variant.price || product.price;
      const totalPrice = unitPrice * cartItem.quantity;

      subtotal += totalPrice;

      items.push({
        productId: product._id,
        variantId: variant._id,
        productName: product.name,
        variantSku: variant.sku,
        attributes: variant.attributes,
        images: variant.images ?? [],
        quantity: cartItem.quantity,
        unitPrice,
        totalPrice,
      });
    }

    const total = subtotal;

    // Reserve the stock first, one atomic update per variant. If any item is
    // short, or anything fails afterwards, what was taken is put back, so
    // stock never leaks and two buyers can never both get the last unit.
    const reserved: { variantId: string; quantity: number }[] = [];
    try {
      for (const item of items) {
        const updatedVariant = await this.variantsService.decreaseStock(
          item.variantId.toString(),
          item.quantity,
        );
        reserved.push({
          variantId: item.variantId.toString(),
          quantity: item.quantity,
        });
        if (updatedVariant.stock <= LOW_STOCK_THRESHOLD) {
          lowStockVariants.push({
            name: item.productName,
            sku: item.variantSku,
            stock: updatedVariant.stock,
          });
        }
      }
    } catch (error) {
      await this.restoreStock(reserved);
      throw error;
    }

    let order;
    try {
      order = await this.orderModel.create({
        user: userId,
        items,
        shippingAddress: createOrderDto.shippingAddress,
        subtotal,
        total,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
      });
    } catch (error) {
      await this.restoreStock(reserved);
      throw error;
    }

    await this.cartService.clearCart(userId);

    await this.notificationsService.notifyUser(
      userId,
      NotificationType.ORDER_PLACED,
      'Order placed',
      `Your order for $${total.toFixed(2)} has been placed and is now pending.`,
      `/orders/${order._id}`,
    );

    await this.notificationsService.notifyAdmins(
      NotificationType.NEW_ORDER,
      'New order received',
      `A new order for $${total.toFixed(2)} was just placed.`,
      `/admin/orders`,
    );

    for (const lowStock of lowStockVariants) {
      await this.notificationsService.notifyAdmins(
        NotificationType.LOW_STOCK,
        'Low stock alert',
        `${lowStock.name} (${lowStock.sku}) is down to ${lowStock.stock} in stock.`,
        `/admin/products`,
      );
    }

    return order;
  }

  async findMyOrder(orderId: string, userId: string) {
    const order = await this.orderModel.findOne({
      _id: orderId,
      user: userId,
    });

    if (!order) {
      throw new NotFoundException('Admin Order not found.');
    }

    return order;
  }

  async findOrder(orderId: string) {
    const order = await this.orderModel.findById(orderId);

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    return order;
  }

  async getMyOrders(userId: string) {
    try {
      const orders = await this.orderModel
        .find({ user: userId })
        .sort({ createdAt: -1 })
        .exec();
      if (!orders || orders.length === 0) {
        throw new NotFoundException('No orders found for this user.');
      }
      return orders;
    } catch (error) {
      throw error;
    }
  }

  async findAll() {
    const orders = await this.orderModel.find();
    if (!orders) {
      throw new NotFoundException('Not found');
    }
    return orders;
  }

  async update(orderId: string, update: UpdateOrderDto) {
    try {
      const previous = await this.orderModel.findById(orderId);
      if (!previous) {
        throw new NotFoundException(`Order with ID ${orderId} not found`);
      }
      const statusChanged =
        update.status !== undefined && update.status !== previous.status;

      const order = await this.orderModel.findByIdAndUpdate(orderId, update, {
        new: true,
      });
      if (!order) {
        throw new NotFoundException(`Order with ID ${orderId} not found`);
      }

      if (statusChanged) {
        await this.notificationsService.notifyUser(
          order.user.toString(),
          NotificationType.ORDER_STATUS_CHANGED,
          'Order status updated',
          `Your order is now ${order.status}.`,
          `/orders/${order._id}`,
        );
      }

      return order;
    } catch (error) {
      console.error(error);
      if (error) throw error;
    }
  }
}
