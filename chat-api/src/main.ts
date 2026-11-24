import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Lets Kubernetes stop the pod cleanly: in-flight requests finish and the
  // database connection closes before the process exits.
  app.enableShutdownHooks();

  // Behind a load balancer or ingress, trust its X-Forwarded-For so rate
  // limiting sees the real client address and not the proxy's.
  if (process.env.TRUST_PROXY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  // Browsers may call the API only from the origins listed in FRONTEND_URL
  // (comma separated). With none listed, cross-origin browser calls are refused.
  const origins = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.enableCors({ origin: origins });
  }

  configureApp(app);

  // Swagger is on for development and off in production unless ENABLE_DOCS=true.
  const docsEnabled = process.env.ENABLE_DOCS
    ? process.env.ENABLE_DOCS === 'true'
    : process.env.NODE_ENV !== 'production';
  if (docsEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Chat API')
        .setDescription(
          'NestJS, PostgreSQL and Redis backend for a messenger: accounts, chats, groups, media and calls.',
        )
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}
bootstrap();
