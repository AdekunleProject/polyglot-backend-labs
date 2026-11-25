import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    const extra: Record<string, number> = {};

    if (exception instanceof HttpException) {
      // errors we threw on purpose (404, 401, validation 400...)
      status = exception.getStatus();
      const body = exception.getResponse();
      message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ??
            exception.message);
      // Numbers a client needs to act on (app lock waits and guesses left).
      if (typeof body === 'object') {
        for (const key of ['attemptsLeft', 'tryAgainInSeconds']) {
          const value = (body as Record<string, unknown>)[key];
          if (typeof value === 'number') extra[key] = value;
        }
      }
    } else if (exception instanceof QueryFailedError) {
      // database errors: PostgreSQL error codes
      const code = (
        exception as QueryFailedError & {
          driverError?: { code?: string };
        }
      ).driverError?.code;
      if (code === '23505') {
        status = HttpStatus.CONFLICT;
        message = 'Resource already exists';
      } else if (code === '23503') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Referenced resource does not exist';
      }
    }

    if (status >= 500) {
      // full detail goes to the log, never to the caller
      this.logger.error(
        `${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${req.method} ${req.url} -> ${status}`);
    }

    if (extra.tryAgainInSeconds) res.setHeader('Retry-After', String(extra.tryAgainInSeconds));
    res.status(status).json({
      statusCode: status,
      message,
      ...extra,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
