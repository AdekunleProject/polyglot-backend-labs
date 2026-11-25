import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  RawBodyRequest,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { AppUnlockedGuard } from '../app-lock/app-unlocked.guard';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { perMinute } from '../auth/throttle';
import { ReasonDto } from '../common/dto/reason.dto';
import { Role } from '../common/enums/role.enum';
import { FundDto, HistoryQueryDto, PayInChatDto, PayQrDto, ResolveQrDto, TransferDto } from './dto/wallet.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.wallet.wallet(user.id);
  }

  @Get('transactions')
  history(@CurrentUser() user: AuthUser, @Query() query: HistoryQueryDto) {
    return this.wallet.history(user.id, query.cursor, query.limit);
  }

  @Post('fund')
  @UseGuards(AppUnlockedGuard)
  @HttpCode(200)
  @Throttle(perMinute(10))
  fund(@CurrentUser() user: AuthUser, @Body() dto: FundDto) {
    return this.wallet.fund(user.id, dto.amount);
  }

  @Get('fund/:reference')
  check(@CurrentUser() user: AuthUser, @Param('reference') reference: string) {
    return this.wallet.checkFunding(user.id, reference);
  }

  @Post('transfer')
  @UseGuards(AppUnlockedGuard)
  @Throttle(perMinute(20))
  transfer(@CurrentUser() user: AuthUser, @Body() dto: TransferDto) {
    return this.wallet.transfer(user.id, {
      toUserId: dto.toUserId,
      amount: dto.amount,
      note: dto.note,
      key: dto.idempotencyKey,
    });
  }

  @Post('pay-qr/resolve')
  @HttpCode(200)
  @Throttle(perMinute(30))
  resolve(@CurrentUser() user: AuthUser, @Body() dto: ResolveQrDto) {
    return this.wallet.resolveQr(user.id, dto.code);
  }

  @Post('pay-qr')
  @UseGuards(AppUnlockedGuard)
  @Throttle(perMinute(20))
  payQr(@CurrentUser() user: AuthUser, @Body() dto: PayQrDto) {
    return this.wallet.payQr(user.id, dto.code, dto.amount, dto.note, dto.idempotencyKey);
  }

  @Post('chats/:conversationId/pay')
  @UseGuards(AppUnlockedGuard)
  @Throttle(perMinute(20))
  payInChat(
    @CurrentUser() user: AuthUser,
    @Param('conversationId') conversationId: string,
    @Body() dto: PayInChatDto,
  ) {
    return this.wallet.payInChat(user.id, conversationId, dto.amount, dto.note, dto.idempotencyKey);
  }
}

/** Money is the admin's job. A superadmin can look (reconcile) but not move money. */
@Controller('admin/wallets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminWalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get('reconcile')
  @Roles(Role.ADMIN, Role.SUPERADMIN)
  reconcile() {
    return this.wallet.reconcile();
  }

  @Post(':userId/freeze')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  freeze(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ReasonDto,
  ) {
    return this.wallet.freeze(admin.id, userId, dto.reason);
  }

  @Post(':userId/unfreeze')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  unfreeze(
    @CurrentUser() admin: AuthUser,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ReasonDto,
  ) {
    return this.wallet.unfreeze(admin.id, userId, dto.reason);
  }

  @Post('transactions/:id/reverse')
  @HttpCode(200)
  @Roles(Role.ADMIN)
  reverse(
    @CurrentUser() admin: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReasonDto,
  ) {
    return this.wallet.reverse(admin.id, id, dto.reason);
  }
}

/**
 * The payment provider calls this. Nothing in the body is trusted until the
 * signature (HMAC-SHA512 of the exact bytes, keyed with the secret key) matches.
 */
@Controller('payments/webhook')
export class PaymentWebhookController {
  constructor(private readonly wallet: WalletService) {}

  @Post('paystack')
  @HttpCode(200)
  @SkipThrottle()
  async paystack(@Req() req: RawBodyRequest<Request>, @Headers('x-paystack-signature') signature?: string) {
    const raw = req.rawBody;
    if (!raw || !signature) throw new UnauthorizedException();
    const expected = createHmac('sha512', this.wallet.webhookSecret()).update(raw).digest('hex');
    const given = Buffer.from(signature, 'utf8');
    const wanted = Buffer.from(expected, 'utf8');
    if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) throw new UnauthorizedException();

    const event = JSON.parse(raw.toString('utf8')) as {
      event?: string;
      data?: { reference?: string; amount?: number; currency?: string };
    };
    if (event.event === 'charge.success' && event.data?.reference) {
      await this.wallet.settleFunding(event.data.reference, Number(event.data.amount), String(event.data.currency));
    }
    return { received: true };
  }
}
