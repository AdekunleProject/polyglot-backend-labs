import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  Patch,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { PaymentsService } from './payment.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { Role } from 'src/common/enums/role.enum';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import type { CurrentUserInterface } from '../common/interfaces/current-user.interface';
import { CurrentUser } from '../common/decorators/current-user.decorators';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { InitializeBankTransferDto } from './dto/initialize-bank-transfer.dto';
import { ConfirmBankTransferDto } from './dto/confirm-bank-transfer.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { uploadOptions } from 'src/aws/aws.multer-uploads';
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}
  @Post('initialize')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  initializePayment(
    @CurrentUser() user: CurrentUserInterface,
    @Body() dto: InitializePaymentDto,
  ) {
    return this.paymentsService.initializePayment(user.id, dto);
  }

  @Post('webhook')
  @HttpCode(200)
  webhook(
    @Req() req: any,
    @Headers('x-paystack-signature')
    signature: string,
  ) {
    return this.paymentsService.handleWebhook(signature, req.body);
  }

  @Post('refund')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async refundPayment(@Body() dto: RefundPaymentDto) {
    return this.paymentsService.refundPayment(dto);
  }

  @Post('bank-transfer')
  @UseGuards(JwtAuthGuard)
  initializeBankTransfer(
    @CurrentUser() user: CurrentUserInterface,
    @Body() dto: InitializeBankTransferDto,
  ) {
    return this.paymentsService.initializeBankTransfer(user.id, dto);
  }

  @Post('bank-transfer/confirm')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('receipt', uploadOptions))
  confirmTransfer(
    @CurrentUser() user: CurrentUserInterface,
    @Body() dto: ConfirmBankTransferDto,
    @UploadedFile() receipt?: Express.Multer.File,
  ) {
    return this.paymentsService.confirmBankTransfer(user.id, dto, receipt);
  }

  @Get('my-payments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  async getMyPayments(@CurrentUser() user: CurrentUserInterface) {
    return this.paymentsService.getMyPayments(user.id);
  }

  @Get('my-payments/:paymentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.CUSTOMER)
  findMyPayment(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: CurrentUserInterface,
  ) {
    return this.paymentsService.findMyPayment(paymentId, user.id);
  }

  @Get(':paymentId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  findPayment(@Param('paymentId') paymentId: string) {
    return this.paymentsService.findPayment(paymentId);
  }

  @Get('verify/:reference')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async verifyPayment(@Param('reference') reference: string) {
    return this.paymentsService.verifyPayment(reference);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async verifyAllPayments() {
    return this.paymentsService.verifyAllPayments();
  }

  @Patch('bank-transfer/:paymentId/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  approveTransfer(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user: CurrentUserInterface,
  ) {
    return this.paymentsService.approveTransfer(paymentId, user.id);
  }

  // BUG FIX: PaymentsService.rejectTransfer() already existed (and
  // already fires a TRANSFER_REJECTED notification) but had no route
  // exposing it at all — admins had no way to actually call it through
  // the API. Added the endpoint here, mirroring the approve route above.
  @Patch('bank-transfer/:paymentId/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  rejectTransfer(@Param('paymentId') paymentId: string) {
    return this.paymentsService.rejectTransfer(paymentId);
  }
}
