import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Lets Kubernetes stop the pod cleanly: in-flight requests finish and the
  // database connection closes before the process exits.
  app.enableShutdownHooks();

  // Browsers may call the API only from the origins listed in FRONTEND_URL
  // (comma separated). With none listed, cross-origin browser calls are refused.
  const origins = (process.env.FRONTEND_URL ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (origins.length > 0) {
    app.enableCors({ origin: origins });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      // Reject unknown fields instead of silently dropping them, so a request
      // like { "role": "admin" } on sign-up fails loudly.
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
