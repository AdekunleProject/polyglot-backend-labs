import {
  ArgumentsHost,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filters';

function fakeHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', originalUrl: '/users' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('keeps the status and message of an HttpException', () => {
    const { host, status, json } = fakeHost();
    new HttpExceptionFilter().catch(new NotFoundException('missing'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, path: '/users' }),
    );
  });

  it('returns a generic 500 for unknown errors and logs the real one', () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { host, status, json } = fakeHost();

    new HttpExceptionFilter().catch(new Error('database exploded'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
      }),
    );
    expect(logSpy).toHaveBeenCalled();
  });
});
