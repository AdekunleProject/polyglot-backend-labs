import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VariantsService } from './product-variant.service';

describe('VariantsService stock', () => {
  const build = (model: Record<string, jest.Mock>) =>
    new VariantsService(model as any, {} as any);

  it('decreases stock with one atomic conditional update', async () => {
    const updated = { stock: 7 };
    const model = { findOneAndUpdate: jest.fn().mockResolvedValue(updated) };

    const result = await build(model).decreaseStock('v1', 3);

    expect(result).toBe(updated);
    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'v1', stock: { $gte: 3 } },
      { $inc: { stock: -3 } },
      { new: true },
    );
  });

  it('refuses when there is not enough stock', async () => {
    const model = {
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
      exists: jest.fn().mockResolvedValue({ _id: 'v1' }),
    };

    await expect(build(model).decreaseStock('v1', 99)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('reports a missing variant as not found', async () => {
    const model = {
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
      exists: jest.fn().mockResolvedValue(null),
    };

    await expect(build(model).decreaseStock('nope', 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('gives stock back with an increment', async () => {
    const model = { findOneAndUpdate: jest.fn().mockResolvedValue({}) };

    await build(model).increaseStock('v1', 2);

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'v1' },
      { $inc: { stock: 2 } },
      { new: true },
    );
  });
});
