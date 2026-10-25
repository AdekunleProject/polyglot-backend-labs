import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { VariantsService } from '../Product-Variants/product-variant.service';
import { Cart } from './schemas/cart.schemas';

@Injectable()
export class CartService {
  constructor(
    @InjectModel(Cart.name)
    private readonly cartModel: Model<Cart>,
    private readonly variantsService: VariantsService,
  ) {}

  async getCart(userId: string) {
    let cart = await this.cartModel
      .findOne({ user: userId })
      .populate('items.variant');

    if (!cart) {
      cart = await this.cartModel.create({
        user: userId,
        items: [],
      });
    }

    return cart;
  }

  async addItem(userId: string, variantId: string, quantity: number) {
    const variant = await this.variantsService.findById(variantId);

    if (!variant.isActive) {
      throw new NotFoundException('Variant is unavailable.');
    }

    if (variant.stock < quantity) {
      throw new BadRequestException('Insufficient stock.');
    }

    const cart = await this.getCart(userId);

    const existingItem = cart.items.find((item) =>
      item.variant.equals(variantId),
    );

    if (existingItem) {
      if (existingItem.quantity + quantity > variant.stock) {
        throw new BadRequestException('Insufficient stock.');
      }

      existingItem.quantity += quantity;
    } else {
      cart.items.push({
        variant: variant._id,
        quantity,
      });
    }

    await cart.save();

    return this.getCart(userId);
  }

  async removeItem(userId: string, variantId: string) {
    const cart = await this.getCart(userId);

    cart.items = cart.items.filter((item) => !item.variant.equals(variantId));
    await cart.save();

    return this.getCart(userId);
  }

  async clearCart(userId: string) {
    const cart = await this.getCart(userId);

    cart.items = [];

    await cart.save();

    return {
      message: 'Cart cleared successfully.',
    };
  }

  async getCartForCheckout(userId: string) {
    await this.getCart(userId);

    const cart = await this.cartModel.findOne({ user: userId }).populate({
      path: 'items.variant',
      populate: {
        path: 'product',
      },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found.');
    }

    return cart;
  }
}
