import { HttpExceptionFilter } from './common/filters/http-exception.filters';
import { AppModule } from './app.module';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Lets Kubernetes stop the pod cleanly: in-flight requests finish and the
  // database connection closes before the process exits.
  app.enableShutdownHooks();

  // Behind a load balancer or ingress, trust its X-Forwarded-For so rate
  // limiting sees the real client address and not the proxy's.
  if (process.env.TRUST_PROXY === 'true') {
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }

  app.use(helmet({ contentSecurityPolicy: false }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  app.useGlobalFilters(new HttpExceptionFilter());

  // Swagger is on for development and off in production unless ENABLE_DOCS=true.
  const docsEnabled = process.env.ENABLE_DOCS
    ? process.env.ENABLE_DOCS === 'true'
    : process.env.NODE_ENV !== 'production';
  if (docsEnabled) {
    const config = new DocumentBuilder()
      .setTitle('E-commerce API')
      .setDescription(
        'NestJS and MongoDB backend: auth, users, products, cart, orders, payments, analytics.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .addSecurityRequirements('bearer')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(process.env.PORT ?? 5000, '0.0.0.0');
}

bootstrap();