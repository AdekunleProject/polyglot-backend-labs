import { api } from './client';

export interface Payment {
  _id: string;
  order: string;
  user: string;
  amount: number;
  currency: string;
  provider: 'PAYSTACK' | 'BANK_TRANSFER';
  status: 'PENDING' | 'AWAITING_CONFIRMATION' | 'PAID' | 'FAILED' | 'REFUNDED';
  transactionReference: string;
  // `receipt` is the uploaded file, resolved server-side to a signed,
  // loadable URL. `receiptUrl` is a separate string field the client
  // submits directly in confirmBankTransfer — see the note on
  // confirmBankTransfer() below for why both exist.
  receipt?: string;
  receiptUrl?: string;
  createdAt: string;
}

export async function initializePayment(orderId: string, callbackUrl?: string) {
  const { data } = await api.post<{ authorizationUrl: string; accessCode: string; reference: string }>(
    '/payments/initialize',
    { orderId, callbackUrl }
  );
  return data;
}

export async function initializeBankTransfer(orderId: string) {
  const { data } = await api.post('/payments/bank-transfer', { orderId });
  return data;
}

// The backend's confirmBankTransfer() sets payment.receiptUrl = dto.receiptUrl
// directly from the request body, separately from the uploaded `receipt` file
// (which goes to S3 via multer and is stored on payment.receipt instead). Both
// fields are read, so both are sent here — see the README for the backend
// inconsistency this papers over.
export async function confirmBankTransfer(paymentId: string, receiptUrl: string, receipt?: File | null) {
  const fd = new FormData();
  fd.append('paymentId', paymentId);
  fd.append('receiptUrl', receiptUrl);
  if (receipt) fd.append('receipt', receipt);
  const { data } = await api.post('/payments/bank-transfer/confirm', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getMyPayments() {
  const { data } = await api.get<Payment[]>('/payments/my-payments');
  return data;
}

export async function getMyPayment(paymentId: string) {
  const { data } = await api.get<Payment>(`/payments/my-payments/${paymentId}`);
  return data;
}

// Admin only
export async function refundPayment(paymentId: string, amount?: number) {
  const { data } = await api.post('/payments/refund', { paymentId, amount });
  return data;
}

export async function approveTransfer(paymentId: string) {
  const { data } = await api.patch(`/payments/bank-transfer/${paymentId}/approve`);
  return data;
}

export async function getAllPayments() {
  const { data } = await api.get<Payment[]>('/payments');
  return data;
}

export async function getPayment(paymentId: string) {
  const { data } = await api.get<Payment>(`/payments/${paymentId}`);
  return data;
}

export async function verifyPaymentByReference(reference: string) {
  const { data } = await api.get(`/payments/verify/${reference}`);
  return data;
}
