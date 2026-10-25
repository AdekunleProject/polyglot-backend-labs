import { IsMongoId, IsString, IsNotEmpty } from 'class-validator';

// CRITICAL BUG FIX: same issue as InitializeBankTransferDto — no
// validation decorators meant every POST /payments/bank-transfer/confirm
// request was rejected outright by forbidNonWhitelisted:true. Bank
// transfer could be initiated but never confirmed — a customer who
// actually paid had no way to tell the store about it through this
// endpoint.
export class ConfirmBankTransferDto {
  @IsMongoId()
  paymentId!: string;

  @IsString()
  @IsNotEmpty()
  receiptUrl!: string;
}
