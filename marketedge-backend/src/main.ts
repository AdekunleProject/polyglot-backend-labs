import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { parseCorsOrigins } from './config/cors';
import { createPaystackWebhookHandler } from './webhooks/paystack-raw.handler';

async function bootstrap() {
  // bodyParser is off so the webhook route can read the raw body: the
  // signature is computed over the exact bytes Paystack sent.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // CSP is off because the Apollo sandbox page loads its own scripts.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({ origin: parseCorsOrigins(process.env.CORS_ORIGIN, process.env.NODE_ENV) });

  app.use('/webhooks/paystack', express.raw({ type: 'application/json' }));
  app.use('/webhooks/paystack', createPaystackWebhookHandler(app));

  app.use(express.json({ limit: '5mb' }));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // Lets Kubernetes stop the pod cleanly: connections close, jobs finish.
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
void bootstrap();
