import { INestApplicationContext } from '@nestjs/common';
import * as crypto from 'crypto';
import { VipIntelligenceService } from '../market-edge/services/vip-intelligence.service';

export async function processRawPaystackWebhook(appContext: INestApplicationContext, rawBody: string, signature: string) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY is not set');
  
  const hash = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
  if (hash !== signature) throw new Error('HMAC verification authentication rejected.');

  const payload = JSON.parse(rawBody);
  if (payload.event === 'charge.success') {
    const vipService = appContext.get(VipIntelligenceService);
    await vipService.processTransactionAndCache(payload.data.customer.customer_code, payload.data.amount / 100, 'paystack-webhook');
  }
}
