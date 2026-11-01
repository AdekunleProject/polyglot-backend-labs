import { assertValidTransaction, VipIntelligenceService } from './vip-intelligence.service';

function setup(customer: object | null = null) {
  const model = {
    findOne: vi.fn(async () => customer),
    findOneAndUpdate: vi.fn(async () => ({
      recentTransactions: [{ amount: 100 }, { amount: 50 }],
    })),
    updateOne: vi.fn(async () => ({})),
  };
  const store = new Map<string, string>();
  const redis = {
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    setex: vi.fn(async (k: string, _s: number, v: string) => void store.set(k, v)),
  };
  const pubSub = { publish: vi.fn(async () => {}) };
  return { service: new VipIntelligenceService(model as any, redis as any, pubSub as any), model, redis, pubSub };
}

describe('assertValidTransaction', () => {
  it('accepts a normal transaction', () => {
    expect(() => assertValidTransaction('CUS_1', 100)).not.toThrow();
  });
  it('rejects bad input', () => {
    expect(() => assertValidTransaction('', 100)).toThrow();
    expect(() => assertValidTransaction('CUS_1', -5)).toThrow();
    expect(() => assertValidTransaction('CUS_1', NaN)).toThrow();
    expect(() => assertValidTransaction('CUS_1', Infinity)).toThrow();
    expect(() => assertValidTransaction('CUS_1', '10' as any)).toThrow();
  });
});

describe('VipIntelligenceService', () => {
  it('calculates the score, caches it and publishes the update', async () => {
    const { service, redis, pubSub } = setup();
    const result = await service.processTransactionAndCache('CUS_1', 50, 'b1');
    expect(result).toEqual({ customerId: 'CUS_1', calculatedVipScore: 300 }); // (100 + 50) * 2
    expect(redis.setex).toHaveBeenCalledWith('vip:score:CUS_1', 3600, '300');
    expect(pubSub.publish).toHaveBeenCalledWith('vipScoreUpdated', {
      vipScoreUpdated: { customerId: 'CUS_1', calculatedVipScore: 300 },
    });
  });

  it('does not touch the database or publish when the amount is invalid', async () => {
    const { service, model, pubSub } = setup();
    await expect(service.processTransactionAndCache('CUS_1', -1, 'b1')).rejects.toThrow();
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
    expect(pubSub.publish).not.toHaveBeenCalled();
  });

  it('serves a cached score without querying MongoDB', async () => {
    const { service, redis, model } = setup();
    await redis.setex('vip:score:CUS_1', 3600, '42');
    expect(await service.getCachedVipScore('CUS_1')).toBe(42);
    expect(model.findOne).not.toHaveBeenCalled();
  });

  it('falls back to MongoDB on a cache miss and caches the result', async () => {
    const { service, redis } = setup({ currentVipScore: 7 });
    expect(await service.getCachedVipScore('CUS_9')).toBe(7);
    expect(redis.setex).toHaveBeenCalledWith('vip:score:CUS_9', 3600, '7');
  });

  it('returns 0 for an unknown customer', async () => {
    const { service } = setup(null);
    expect(await service.getCachedVipScore('nobody')).toBe(0);
  });
});
