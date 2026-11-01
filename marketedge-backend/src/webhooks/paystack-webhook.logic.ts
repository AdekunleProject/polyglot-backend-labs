import { verifyPaystackSignature } from './paystack-signature';

const EVENT_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface WebhookDeps {
  secret: string | undefined;
  redis: {
    set(key: string, value: string, mode: 'EX', seconds: number, flag: 'NX'): Promise<string | null>;
    del(key: string): Promise<number>;
  };
  vip: { processTransactionAndCache(customerId: string, amount: number, branchId: string): Promise<unknown> };
  log?: (message: string) => void;
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

interface ChargeSuccessPayload {
  event?: string;
  data?: {
    reference?: string;
    id?: number | string;
    amount?: number;
    customer?: { customer_code?: string };
  };
}

/**
 * Pure webhook logic (no Express), so it can be unit tested.
 * - bad or missing signature: 401 with a generic message
 * - duplicate delivery of the same event: 200, processed only once
 * - processing failure: 500 so Paystack retries, and the dedupe key is
 *   removed so the retry is not skipped
 */
export async function handlePaystackWebhook(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  deps: WebhookDeps,
): Promise<WebhookResult> {
  if (!verifyPaystackSignature(rawBody, signature, deps.secret)) {
    return { status: 401, body: { error: 'Invalid signature' } };
  }

  let payload: ChargeSuccessPayload;
  try {
    payload = JSON.parse((rawBody as Buffer).toString('utf8'));
  } catch {
    return { status: 400, body: { error: 'Invalid JSON' } };
  }

  if (payload.event !== 'charge.success') {
    return { status: 200, body: { received: true, ignored: true } };
  }

  const customerCode = payload.data?.customer?.customer_code;
  const amountKobo = payload.data?.amount;
  const eventId = payload.data?.reference ?? payload.data?.id;
  if (!customerCode || typeof amountKobo !== 'number' || eventId === undefined) {
    return { status: 400, body: { error: 'Malformed charge.success payload' } };
  }

  const key = `paystack:evt:${eventId}`;
  const first = await deps.redis.set(key, '1', 'EX', EVENT_TTL_SECONDS, 'NX');
  if (first !== 'OK') {
    return { status: 200, body: { received: true, duplicate: true } };
  }

  try {
    await deps.vip.processTransactionAndCache(customerCode, amountKobo / 100, 'paystack-webhook');
  } catch (error) {
    await deps.redis.del(key);
    deps.log?.(`Processing failed: ${(error as Error).message}`);
    return { status: 500, body: { error: 'Processing failed' } };
  }
  return { status: 200, body: { received: true } };
}

