import { Test, TestingModule } from '@nestjs/testing';
import { VariantsController } from './product-variant.controller';

describe('VariantsController', () => {
  let controller: VariantsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VariantsController],
    }).compile();

    controller = module.get<VariantsController>(VariantsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
