import { INestApplication, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Everything that is not a module: security headers, pipes and filters.
 * Shared by main.ts and the integration test, so the test runs the real setup.
 */
export function configureApp(app: INestApplication) {
  // CSP stays off so the Swagger page at /docs can load its own assets.
  app.use(helmet({ contentSecurityPolicy: false }));
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
}
