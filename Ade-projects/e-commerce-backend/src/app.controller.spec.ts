import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/mongoose';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const connection = {
    readyState: 1,
    db: { admin: () => ({ ping: jest.fn() }) },
  };

  async function build(overrides: Record<string, unknown> = {}) {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: getConnectionToken(), useValue: { ...connection, ...overrides } },
      ],
    }).compile();
    return app.get<AppController>(AppController);
  }

  beforeEach(async () => {
    appController = await build();
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('reports ok so Docker and Kubernetes can probe the app', () => {
      expect(appController.health()).toEqual({ status: 'ok' });
    });
  });

  describe('ready', () => {
    it('is ready when MongoDB answers a ping', async () => {
      const ok = await build({
        db: { admin: () => ({ ping: jest.fn().mockResolvedValue({ ok: 1 }) }) },
      });
      await expect(ok.ready()).resolves.toEqual({ status: 'ready', mongo: true });
    });

    it('is not ready when the connection is down', async () => {
      const down = await build({ readyState: 0 });
      await expect(down.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('is not ready when MongoDB stops answering', async () => {
      const broken = await build({
        db: { admin: () => ({ ping: jest.fn().mockRejectedValue(new Error('gone')) }) },
      });
      await expect(broken.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
