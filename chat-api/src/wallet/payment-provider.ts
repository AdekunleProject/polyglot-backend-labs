import { Logger, ServiceUnavailableException } from '@nestjs/common';

export interface PaymentProvider {
  readonly name: string;
  /** Starts a card or bank payment. The person pays on `authorizationUrl`. */
  initialize(input: { email: string; amountKobo: number; reference: string }): Promise<{ authorizationUrl: string }>;
  /** Asks the provider whether a payment was made. Null when it cannot say. */
  verify(reference: string): Promise<{ paid: boolean; amountKobo: number; currency: string } | null>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Paystack. Test keys (sk_test_...) move no real money. Not exercised against the live service. */
export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack';
  private readonly logger = new Logger('PaystackProvider');

  constructor(private readonly secretKey: string) {}

  private async call(path: string, init?: RequestInit) {
    const response = await fetch(`https://api.paystack.co${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/json' },
    });
    const json = (await response.json().catch(() => null)) as { status?: boolean; data?: Record<string, unknown> } | null;
    if (!response.ok || !json?.status) {
      this.logger.error(`Paystack ${path} answered ${response.status}`);
      throw new ServiceUnavailableException('The payment provider is not available right now');
    }
    return json.data ?? {};
  }

  async initialize(input: { email: string; amountKobo: number; reference: string }) {
    const data = await this.call('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        reference: input.reference,
        currency: 'NGN',
      }),
    });
    return { authorizationUrl: String(data.authorization_url) };
  }

  async verify(reference: string) {
    const data = await this.call(`/transaction/verify/${encodeURIComponent(reference)}`);
    return {
      paid: data.status === 'success',
      amountKobo: Number(data.amount),
      currency: String(data.currency),
    };
  }
}

/** For development and tests: nothing is charged. Refuses to work in production. */
export class FakeProvider implements PaymentProvider {
  readonly name = 'fake';

  constructor(private readonly production: boolean) {}

  async initialize(input: { reference: string }) {
    if (this.production) throw new ServiceUnavailableException('Payments are not configured');
    return { authorizationUrl: `https://pay.fake.test/checkout/${input.reference}` };
  }

  async verify() {
    return null;
  }
}
