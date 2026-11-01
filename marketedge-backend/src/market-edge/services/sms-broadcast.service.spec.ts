import { BROADCAST_BATCH_SIZE, SmsBroadcastService } from './sms-broadcast.service';

function setup() {
  let id = 0;
  const insertMany = vi.fn(async (docs: object[]) => docs.map((d) => ({ ...d, _id: `t${++id}` })));
  const addBulk = vi.fn(async (_jobs: unknown[]) => []);
  const service = new SmsBroadcastService({ addBulk } as any, { insertMany } as any);
  return { service, insertMany, addBulk };
}

const input = (n: number) => ({
  broadcastId: 'b1',
  payload: Array.from({ length: n }, (_, i) => ({ phone: `+234800${String(i).padStart(7, '0')}`, msg: 'hello' })),
});

describe('SmsBroadcastService', () => {
  it('saves and queues every message and returns the count', async () => {
    const { service, insertMany, addBulk } = setup();
    const result = await service.enqueueMassBroadcast(input(5));
    expect(result).toEqual({ success: true, count: 5 });
    expect(insertMany).toHaveBeenCalledTimes(1);
    expect(addBulk).toHaveBeenCalledTimes(1);
  });

  it('splits a large broadcast into batches of 1,000', async () => {
    const { service, insertMany, addBulk } = setup();
    const result = await service.enqueueMassBroadcast(input(2500));
    expect(BROADCAST_BATCH_SIZE).toBe(1000);
    expect(result.count).toBe(2500);
    expect(insertMany).toHaveBeenCalledTimes(3);
    expect(addBulk).toHaveBeenCalledTimes(3);
    expect(insertMany.mock.calls[2][0]).toHaveLength(500);
  });

  it('puts only the task id in the job, never the phone number or text', async () => {
    const { service, addBulk } = setup();
    await service.enqueueMassBroadcast(input(1));
    const jobs = addBulk.mock.calls[0][0] as unknown as { data: object; opts: { attempts: number } }[];
    expect(jobs[0].data).toEqual({ taskId: 't1' });
    expect(jobs[0].opts.attempts).toBe(3);
  });

  it('does nothing for an empty payload', async () => {
    const { service, insertMany } = setup();
    expect(await service.enqueueMassBroadcast(input(0))).toEqual({ success: true, count: 0 });
    expect(insertMany).not.toHaveBeenCalled();
  });
});
