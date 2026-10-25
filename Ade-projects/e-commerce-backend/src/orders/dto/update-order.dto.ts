import { IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '../schemas/order.schema';

// BUG FIX: this previously extended PartialType(CreateOrderDto), which
// only has shipping-address fields — no `status` at all. Combined with
// the global ValidationPipe's forbidNonWhitelisted:true, that meant any
// `status` sent to PUT /orders/:orderId was silently stripped before it
// reached the controller, so admins could never actually change an
// order's status through this endpoint despite the admin UI assuming
// they could. This is its own DTO now, with the field that route is
// actually meant to update.
//
// paymentStatus is deliberately NOT included here — that should only
// ever change via the payment flows in PaymentsService (Paystack
// webhook, bank transfer approval, refund), not be hand-editable by an
// admin here, so it isn't exposed on this endpoint at all.
export class UpdateOrderDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
