import { OrderService } from './order.service';

const input = {
  idempotencyKey: '3f1c1f0a-6a47-4c3e-9a55-0e6b8d3c2f10',
  items: [{ sku: 'A1', quantity: 2, unitPrice: 10 }],
};

describe('OrderService.placeOrder', () => {
  it('creates an order for the calling agent', async () => {
    const create = vi.fn(async (doc: object) => ({ _id: 'o1', ...doc }));
    const service = new OrderService({ create } as any);
    const order: any = await service.placeOrder('agent-1', input);
    expect(order.agentId).toBe('agent-1');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('returns the existing order when the same key is sent again', async () => {
    const existing = { _id: 'o1', idempotencyKey: input.idempotencyKey };
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    const findOne = vi.fn(async () => existing);
    const service = new OrderService({ create, findOne } as any);
    expect(await service.placeOrder('agent-1', input)).toEqual(existing);
    expect(findOne).toHaveBeenCalledWith({ idempotencyKey: input.idempotencyKey });
  });

  it('rethrows any other database error', async () => {
    const create = vi.fn().mockRejectedValue(new Error('connection lost'));
    const service = new OrderService({ create } as any);
    await expect(service.placeOrder('agent-1', input)).rejects.toThrow('connection lost');
  });
});
