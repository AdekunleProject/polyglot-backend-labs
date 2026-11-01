import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { VipIntelligenceService } from '../market-edge/services/vip-intelligence.service';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { handlePaystackWebhook } from './paystack-webhook.logic';

/** Express wrapper. Mount it after express.raw() so req.body is a Buffer. */
export function createPaystackWebhookHandler(app: INestApplication) {
  const logger = new Logger('PaystackWebhook');
  return async (req: Request, res: Response) => {
    const result = await handlePaystackWebhook(
      Buffer.isBuffer(req.body) ? req.body : undefined,
      req.headers['x-paystack-signature'] as string | undefined,
      {
        secret: process.env.PAYSTACK_SECRET_KEY,
        redis: app.get(REDIS_CLIENT),
        vip: app.get(VipIntelligenceService),
        log: (message) => logger.error(message),
      },
    );
    res.status(result.status).json(result.body);
  };
}
