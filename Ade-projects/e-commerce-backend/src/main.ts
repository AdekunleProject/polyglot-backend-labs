import { HttpExceptionFilter } from './common/filters/http-exception.filters';
import { AppModule } from './app.module';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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

  app.useGlobalGuards(app.get(ThrottlerGuard));

  app.useGlobalFilters(new HttpExceptionFilter());

  if (process.env.ENABLE_DOCS !== 'false') {
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

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
}

bootstrap();