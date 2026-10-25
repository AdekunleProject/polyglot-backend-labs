import { IsMongoId } from 'class-validator';

// CRITICAL BUG FIX: same issue as RefreshTokenDto — no validation
// decorators at all meant the global ValidationPipe's
// forbidNonWhitelisted:true rejected every POST /payments/bank-transfer
// request outright ("property orderId should not exist"). Bank transfer
// could never even be initiated.
export class InitializeBankTransferDto {
  @IsMongoId()
  orderId!: string;
}
