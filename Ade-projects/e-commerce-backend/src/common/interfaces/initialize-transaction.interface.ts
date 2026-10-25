export interface InitializeTransactionInterface {
  email: string;
  amount: number;
  reference: string;
  callback_url?: string;
  metadata?: Record<string, unknown>;
}
