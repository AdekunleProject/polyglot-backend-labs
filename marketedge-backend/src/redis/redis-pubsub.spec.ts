import { EventEmitter } from 'events';
import { RedisPubSub } from './redis-pubsub';

class FakeRedis extends EventEmitter {
  publish = vi.fn(async () => 1);
  subscribe = vi.fn(async () => 1);
  unsubscribe = vi.fn(async () => 1);
  quit = vi.fn(async () => 'OK');
  disconnect = vi.fn();
}

function setup() {
  const publisher = new FakeRedis();
  const subscriber = new FakeRedis();
  const pubSub = new RedisPubSub(publisher as any, subscriber as any);
  return { publisher, subscriber, pubSub };
}

describe('RedisPubSub', () => {
  it('publishes JSON on the channel', async () => {
    const { publisher, pubSub } = setup();
    await pubSub.publish('vipScoreUpdated', { customerId: 'c1' });
    expect(publisher.publish).toHaveBeenCalledWith('vipScoreUpdated', '{"customerId":"c1"}');
  });

  it('delivers a message from Redis to every subscriber of that channel', async () => {
    const { subscriber, pubSub } = setup();
    const first = vi.fn();
    const second = vi.fn();
    await pubSub.subscribe('vipScoreUpdated', first);
    await pubSub.subscribe('vipScoreUpdated', second);
    subscriber.emit('message', 'vipScoreUpdated', '{"customerId":"c1"}');
    expect(first).toHaveBeenCalledWith({ customerId: 'c1' });
    expect(second).toHaveBeenCalledWith({ customerId: 'c1' });
  });

  it('subscribes to a Redis channel once and unsubscribes when the last listener leaves', async () => {
    const { subscriber, pubSub } = setup();
    const a = await pubSub.subscribe('chan', vi.fn());
    const b = await pubSub.subscribe('chan', vi.fn());
    expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
    pubSub.unsubscribe(a);
    expect(subscriber.unsubscribe).not.toHaveBeenCalled();
    pubSub.unsubscribe(b);
    expect(subscriber.unsubscribe).toHaveBeenCalledWith('chan');
  });

  it('ignores messages for other channels and malformed JSON', async () => {
    const { subscriber, pubSub } = setup();
    const listener = vi.fn();
    await pubSub.subscribe('chan', listener);
    subscriber.emit('message', 'other', '{"a":1}');
    subscriber.emit('message', 'chan', 'not json');
    expect(listener).not.toHaveBeenCalled();
  });

  it('closes both connections', async () => {
    const { publisher, subscriber, pubSub } = setup();
    await pubSub.close();
    expect(publisher.quit).toHaveBeenCalled();
    expect(subscriber.quit).toHaveBeenCalled();
  });
});
