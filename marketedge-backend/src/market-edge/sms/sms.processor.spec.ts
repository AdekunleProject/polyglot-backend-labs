import { SmsProcessor } from './sms.processor';

function setup(task: object | null) {
  const model = {
    findById: vi.fn(async () => task),
    updateOne: vi.fn(async () => ({})),
  };
  const provider = { send: vi.fn().mockResolvedValue({ providerMessageId: 'm1' }) };
  return { processor: new SmsProcessor(model as any, provider as any), model, provider };
}
const job = (extra: object = {}) => ({ data: { taskId: 't1' }, opts: { attempts: 3 }, attemptsMade: 1, ...extra }) as any;

describe('SmsProcessor', () => {
  it('sends a pending task and marks it SENT', async () => {
    const { processor, model, provider } = setup({ _id: 't1', status: 'PENDING', phoneNumber: '+2348000000001', message: 'hi' });
    await processor.process(job());
    expect(provider.send).toHaveBeenCalledWith('+2348000000001', 'hi');
    expect(model.updateOne).toHaveBeenCalledWith({ _id: 't1' }, { $set: { status: 'SENT', providerMessageId: 'm1' } });
  });

  it('does not send twice when a retry finds the task already SENT', async () => {
    const { processor, provider } = setup({ _id: 't1', status: 'SENT', phoneNumber: 'x', message: 'y' });
    await processor.process(job());
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('skips a task that no longer exists', async () => {
    const { processor, provider } = setup(null);
    await processor.process(job());
    expect(provider.send).not.toHaveBeenCalled();
  });

  it('marks FAILED only after the last attempt', async () => {
    const { processor, model } = setup(null);
    await processor.onFailed(job({ attemptsMade: 1 }), new Error('boom'));
    expect(model.updateOne).not.toHaveBeenCalled();
    await processor.onFailed(job({ attemptsMade: 3 }), new Error('boom'));
    expect(model.updateOne).toHaveBeenCalledWith({ _id: 't1' }, { $set: { status: 'FAILED', error: 'boom' } });
  });
});
