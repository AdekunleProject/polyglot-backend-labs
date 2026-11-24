import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  async function build(dataSource: Record<string, unknown>) {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    return app.get<AppController>(AppController);
  }

  describe('root', () => {
    it('should return "Hello World!"', async () => {
      const controller = await build({ isInitialized: true, query: jest.fn() });
      expect(controller.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('reports ok without touching the database', async () => {
      const query = jest.fn();
      const controller = await build({ isInitialized: false, query });
      expect(controller.health()).toEqual({ status: 'ok' });
      expect(query).not.toHaveBeenCalled();
    });
  });

  describe('ready', () => {
    it('is ready when the database answers', async () => {
      const controller = await build({
        isInitialized: true,
        query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      });
      await expect(controller.ready()).resolves.toEqual({
        status: 'ready',
        database: true,
      });
    });

    it('is not ready before the connection exists', async () => {
      const controller = await build({ isInitialized: false, query: jest.fn() });
      await expect(controller.ready()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('is not ready when the database stops answering', async () => {
      const controller = await build({
        isInitialized: true,
        query: jest.fn().mockRejectedValue(new Error('connection lost')),
      });
      await expect(controller.ready()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
