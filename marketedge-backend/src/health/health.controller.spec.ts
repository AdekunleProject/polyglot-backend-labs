import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

const build = (readyState: number, ping: () => Promise<string>) =>
  new HealthController({ readyState } as any, { ping } as any);

describe('HealthController', () => {
  it('reports ok so Docker and Kubernetes can probe the app', () => {
    expect(build(0, async () => 'PONG').health()).toEqual({ status: 'ok' });
  });

  it('is ready when MongoDB and Redis both answer', async () => {
    await expect(build(1, async () => 'PONG').ready()).resolves.toEqual({
      status: 'ready',
      mongo: true,
      redis: true,
    });
  });

  it('is not ready when MongoDB is disconnected', async () => {
    await expect(build(0, async () => 'PONG').ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('is not ready when Redis throws', async () => {
    const failing = async () => {
      throw new Error('connection refused');
    };
    await expect(build(1, failing).ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
