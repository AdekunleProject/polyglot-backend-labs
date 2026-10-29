import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import * as express from 'express';
import { processRawPaystackWebhook } from './webhooks/paystack-raw.handler';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use('/webhooks/paystack', express.raw({ type: 'application/json' }));
  app.use('/webhooks/paystack', async (req: any, res: any) => {
    try {
      const signature = req.headers['x-paystack-signature'];
      if (!signature) return res.status(400).send('Missing Authorization Header Signature');

      const rawTextBody = req.body.toString('utf8');
      await processRawPaystackWebhook(app, rawTextBody, signature);
      
      return res.status(200).send({ received: true });
    } catch (error: any) {
      return res.status(400).send({ error: error.message });
    }
  });

  app.use(express.json());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
