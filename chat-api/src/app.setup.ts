import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { isOlderVersion } from './common/app-version';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Everything that is not a module: security headers, pipes and filters.
 * Shared by main.ts and the integration test, so the test runs the real setup.
 */
export function configureApp(app: INestApplication) {
  // CSP stays off so the Swagger page at /docs can load its own assets.
  app.use(helmet({ contentSecurityPolicy: false }));
  // Phone apps send X-Client: mobile and X-App-Version. When MIN_APP_VERSION
  // is set, an older app gets 426 so it can show an "update the app" screen.
  const minVersion = app.get(ConfigService).get<string>('MIN_APP_VERSION');
  if (minVersion) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.headers['x-client'] === 'mobile') {
        const version = req.headers['x-app-version'];
        if (typeof version !== 'string' || isOlderVersion(version, minVersion)) {
          res.status(426).json({
            statusCode: 426,
            code: 'UPGRADE_REQUIRED',
            message: 'Please update the app',
            minVersion,
          });
          return;
        }
      }
      next();
    });
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
}
