import { createHmac } from 'crypto';
import { handlePaystackWebhook } from './paystack-webhook.logic';

const SECRET = 'sk_test_secret';
const sign = (body: Buffer) => createHmac('sha512', SECRET).update(body).digest('hex');
const event = (over: object = {}) =>
  Buffer.from(
    JSON.stringify({
      event: 'charge.success',
      data: { reference: 'ref1', amount: 250000, customer: { customer_code: 'CUS_1' } },
      ...over,
    }),
  );

function makeDeps() {
  const seen = new Set<string>();
  return {
    seen,
    secret: SECRET,
    redis: {
      set: vi.fn(async (key: string) => (seen.has(key) ? null : (seen.add(key), 'OK'))),
      del: vi.fn(async (key: string) => (seen.delete(key) ? 1 : 0)),
    },
    vip: { processTransactionAndCache: vi.fn().mockResolvedValue({}) },
  };
}

describe('handlePaystackWebhook', () => {
  it('rejects a missing signature with 401', async () => {
    const deps = makeDeps();
    const res = await handlePaystackWebhook(event(), undefined, deps as any);
    expect(res.status).toBe(401);
    expect(deps.vip.processTransactionAndCache).not.toHaveBeenCalled();
  });

  it('rejects a wrong signature with 401 and a generic message', async () => {
    const deps = makeDeps();
    const res = await handlePaystackWebhook(event(), 'ab'.repeat(64), deps as any);
    expect(res).toEqual({ status: 401, body: { error: 'Invalid signature' } });
  });

  it('processes a valid charge.success once, converting kobo to naira', async () => {
    const deps = makeDeps();
    const body = event();
    const res = await handlePaystackWebhook(body, sign(body), deps as any);
    expect(res.status).toBe(200);
    expect(deps.vip.processTransactionAndCache).toHaveBeenCalledWith('CUS_1', 2500, 'paystack-webhook');
  });

  it('ignores a duplicate delivery of the same event', async () => {
    const deps = makeDeps();
    const body = event();
    await handlePaystackWebhook(body, sign(body), deps as any);
    const second = await handlePaystackWebhook(body, sign(body), deps as any);
    expect(second.body).toEqual({ received: true, duplicate: true });
    expect(deps.vip.processTransactionAndCache).toHaveBeenCalledTimes(1);
  });

  it('returns 500 and frees the dedupe key when processing fails, so a retry works', async () => {
    const deps = makeDeps();
    deps.vip.processTransactionAndCache.mockRejectedValueOnce(new Error('db down'));
    const body = event();
    const first = await handlePaystackWebhook(body, sign(body), deps as any);
    expect(first.status).toBe(500);
    expect(JSON.stringify(first.body)).not.toContain('db down');
    const retry = await handlePaystackWebhook(body, sign(body), deps as any);
    expect(retry.status).toBe(200);
    expect(deps.vip.processTransactionAndCache).toHaveBeenCalledTimes(2);
  });

  it('acknowledges other events without processing', async () => {
    const deps = makeDeps();
    const body = event({ event: 'transfer.success' });
    const res = await handlePaystackWebhook(body, sign(body), deps as any);
    expect(res.status).toBe(200);
    expect(deps.vip.processTransactionAndCache).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed charge.success', async () => {
    const deps = makeDeps();
    const body = event({ data: { reference: 'r' } });
    const res = await handlePaystackWebhook(body, sign(body), deps as any);
    expect(res.status).toBe(400);
  });
});
